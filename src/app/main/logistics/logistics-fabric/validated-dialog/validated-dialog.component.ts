import { Unit } from 'src/app/core/models/unit.model';
import { take, map, debounceTime, tap, startWith } from 'rxjs/operators';
import { AuthService } from 'src/app/core/services/auth.service';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { AngularFirestore } from '@angular/fire/firestore';
import { BuyRequestedProduct } from './../../../../core/models/buy.model';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatabaseService } from './../../../../core/services/database.service';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Component, OnInit, Inject } from '@angular/core';

@Component({
  selector: 'app-validated-dialog',
  templateUrl: './validated-dialog.component.html',
  styleUrls: ['./validated-dialog.component.scss']
})
export class ValidatedDialogComponent implements OnInit {
  loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();

  validatedFormGroup: FormGroup;

  validatedAll$: Observable<boolean>

  retQuantity$: Observable<boolean>
  mermQuantity$: Observable<boolean>

  negative$: Observable<boolean>

  constructor(
    private dialogRef: MatDialogRef<ValidatedDialogComponent>,
    private dbs: DatabaseService,
    private snackBar: MatSnackBar,
    private auth: AuthService,
    private fb: FormBuilder,
    private af: AngularFirestore,
    @Inject(MAT_DIALOG_DATA) public data: { item: BuyRequestedProduct, edit: true }
  ) { }

  ngOnInit(): void {

    if (this.data.edit) {
      this.validatedFormGroup = this.fb.group({
        mermaStock: [this.data.item.validationData.mermaStock, Validators.min(0)],
        returned: [this.data.item.validationData.returned, Validators.min(0)],
        observations: this.data.item.validationData.observations
      })

      if (this.data.item.validatedStatus == 'validado') {
        this.validatedFormGroup.disable()
      }
    } else {
      this.validatedFormGroup = this.fb.group({
        mermaStock: [0, Validators.min(0)],
        returned: [0, Validators.min(0)],
        observations: null
      })
    }

    this.retQuantity$ = this.validatedFormGroup.get('returned').valueChanges.pipe(
      map(ret => {
        return this.data.item.quantity - this.validatedFormGroup.get('mermaStock').value < ret
      })
    )

    this.mermQuantity$ = this.validatedFormGroup.get('mermaStock').valueChanges.pipe(
      map(mer => {
        return this.data.item.quantity - this.validatedFormGroup.get('returned').value < mer
      })
    )

    this.negative$ = combineLatest(
      this.validatedFormGroup.get('returned').valueChanges.pipe(
        startWith(0)
      ),
      this.validatedFormGroup.get('mermaStock').valueChanges.pipe(
        startWith(0)
      )
    ).pipe(
      map(([ret, merm]) => {
        return ret < 0 || merm < 0
      })
    )

  }

  getUnit(unit: Unit, show: boolean) {
    if (show) {
      if (unit.weight == 1) {
        return unit.weight + ' ' + unit.abbreviation
      } else {
        return '(' + unit.weight + ' ' + unit.abbreviation.split(' ')[1] + ')'
      }
    } else {
      if (unit.weight == 1) {
        return unit.abbreviation
      } else {
        return '(' + unit.abbreviation + ')'
      }
    }

  }


  getStock() {
    let increase = this.data.item.quantity
    let decrease = this.validatedFormGroup.get('mermaStock').value + this.validatedFormGroup.get('returned').value
    return increase - decrease
  }

  isInvalidNumber() {
    return this.getStock() < 0 && this.getStock() > this.data.item.quantity
  }

  edit() {

    const merStatic = this.data.item.validationData.mermaStock
    const returnStatic = this.data.item.validationData.returned

    let mermChange = this.validatedFormGroup.get('mermaStock').value
    let returnChange = this.validatedFormGroup.get('returned').value
    let observ = this.validatedFormGroup.get('observations').value

    const stockStatic = this.data.item.quantity - (merStatic + returnStatic)
    if (merStatic != mermChange || returnStatic != returnChange || observ) {
      let newMerm = mermChange - merStatic
      let newReturn = returnChange - returnStatic
      let newStock = this.getStock() - stockStatic

      this.editSave(newMerm, newReturn, newStock)

    } else {
      this.dialogRef.close()
    }

  }

  editSave(difMerm, difRet, difSt) {
    this.loading.next(true)
    this.validatedFormGroup.markAsPending();
    this.validatedFormGroup.disable()
    const requestRef = this.af.firestore.collection(`/db/haku/buys`).doc(this.data.item.buyId);
    const requestProductRef = this.af.firestore.collection(`/db/haku/buys/${this.data.item.buyId}/buyRequestedProducts`).doc(this.data.item.id);
    const ref = this.af.firestore.collection(`/db/haku/productsList`).doc(this.data.item.id);

    combineLatest(
      this.auth.user$,
      this.dbs.getBuyRequestedProducts(this.data.item.buyId).pipe(
        map(products => {
          let prodFilter = products.map(el => {
            let count = 0
            if (el.id == this.data.item.id) {
              el.validated = this.validatedFormGroup.value['returned'] == 0
              count = this.validatedFormGroup.get('returned').value
            } else {
              if (el.validationData) {
                count = el.validationData.returned
              }
            }
            return {
              ...el,
              count: count
            }
          })
          return {
            validated: prodFilter.reduce((a, b) => a && b.validated, true),
            returnedQuantity: prodFilter.reduce((a, b) => a + b.count, 0)
          }
        })
      )).pipe(take(1)).subscribe(([user, res]) => {
        this.af.firestore.runTransaction((transaction) => {
          return transaction.get(ref).then((prodDoc) => {
            let newStock = prodDoc.data().realStock + difSt;
            let newMerma = prodDoc.data().mermaStock + difMerm;
            transaction.update(ref, {
              realStock: newStock,
              mermaStock: newMerma
            });

            if (this.validatedFormGroup.value['returned'] == 0) {
              transaction.update(requestProductRef, {
                validated: true,
                validatedBy: user,
                validatedDate: new Date(),
                validationData: this.validatedFormGroup.value,
                validatedStatus: 'validado',
                returned: false,
                returnedQuantity: 0,
                returnedValidated: false
              })

              transaction.update(requestRef, {
                validated: res.validated,
                validatedDate: res.validated ? new Date() : null,
                editedDate: res.validated ? new Date() : null,
                editedBy: res.validated ? user : null,
                status: res.validated ? 'validado' : 'pendiente'
              })
            } else {
              transaction.update(requestProductRef, {
                validationData: this.validatedFormGroup.value,
                validatedStatus: 'pendiente',
                returned: true,
                returnedQuantity: this.validatedFormGroup.value['returned'],
                returnedValidated: false,
                returnedStatus: 'por validar',
              })

              transaction.update(requestRef, {
                returned: res.returnedQuantity > 0,
                returnedQuantity: res.returnedQuantity,
                returnedValidated: false,
                returnedStatus: 'por validar',
                status: 'pendiente',
                editedDate: res.validated ? new Date() : null,
                editedBy: res.validated ? user : null,
              })
            }

          });
        }).then(() => {
          this.loading.next(false)
          this.dialogRef.close()
          this.snackBar.open(
            'Producto editado',
            'Cerrar',
            { duration: 6000, }
          );

        })
      })

  }

  save() {
    this.editSave(this.validatedFormGroup.value['mermaStock'],0 ,this.getStock())
  }

}
