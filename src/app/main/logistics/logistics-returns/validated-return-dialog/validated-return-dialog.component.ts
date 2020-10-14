import { Unit } from 'src/app/core/models/unit.model';
import { take, map, debounceTime, tap, startWith } from 'rxjs/operators';
import { AuthService } from 'src/app/core/services/auth.service';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { AngularFirestore } from '@angular/fire/firestore';
import { BuyRequestedProduct } from './../../../../core/models/buy.model';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatabaseService } from './../../../../core/services/database.service';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Component, OnInit, Inject } from '@angular/core';

@Component({
  selector: 'app-validated-return-dialog',
  templateUrl: './validated-return-dialog.component.html',
  styleUrls: ['./validated-return-dialog.component.scss']
})
export class ValidatedReturnDialogComponent implements OnInit {
  loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();

  validatedFormGroup: FormGroup;

  validatedAll$: Observable<boolean>

  retQuantity$: Observable<boolean>
  mermQuantity$: Observable<boolean>

  negative$: Observable<boolean>

  constructor(
    private dialogRef: MatDialogRef<ValidatedReturnDialogComponent>,
    private dbs: DatabaseService,
    private snackBar: MatSnackBar,
    private auth: AuthService,
    private fb: FormBuilder,
    private af: AngularFirestore,
    @Inject(MAT_DIALOG_DATA) public data: { item: BuyRequestedProduct }
  ) { }

  ngOnInit(): void {

    this.validatedFormGroup = this.fb.group({
      mermaStock: 0,
      returned: 0
    })

    this.retQuantity$ = this.validatedFormGroup.get('returned').valueChanges.pipe(
      map(ret => {
        return this.data.item.returnedQuantity - this.validatedFormGroup.get('mermaStock').value < ret
      })
    )

    this.mermQuantity$ = this.validatedFormGroup.get('mermaStock').valueChanges.pipe(
      map(mer => {
        return this.data.item.returnedQuantity - this.validatedFormGroup.get('returned').value < mer
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
    let increase = this.data.item.returnedQuantity
    let decrease = this.validatedFormGroup.get('mermaStock').value + this.validatedFormGroup.get('returned').value
    return increase - decrease
  }


  save() {
    if (this.getStock() != 0 || this.validatedFormGroup.get('mermaStock').value != 0) {
      this.saveAll()
    }
  }


  saveAll() {
    this.loading.next(true)
    this.validatedFormGroup.markAsPending();
    this.validatedFormGroup.disable()
    const requestRef = this.af.firestore.collection(`/db/24multiservicios/buys`).doc(this.data.item.buyId);
    const requestProductRef = this.af.firestore.collection(`/db/24multiservicios/buys/${this.data.item.buyId}/buyRequestedProducts`).doc(this.data.item.id);

    combineLatest(
      this.auth.user$,
      this.dbs.getBuyRequestedProducts(this.data.item.buyId).pipe(
        map(products => {

          let prodv = products.map(el => {
            if (el.id == this.data.item.id) {
              el.validated = this.validatedFormGroup.get('returned').value == 0
            }
            return el
          })

          let prodFilter = products.filter(el => el.returned).map(el => {
            if (el.id == this.data.item.id) {
              el.returnedValidated = this.validatedFormGroup.get('returned').value == 0
            }

            return el
          })
          return {
            validated: prodv.reduce((a, b) => a && b.validated, true),
            returnedValidated: prodFilter.reduce((a, b) => a && b.returnedValidated, true)
          }
        })
      )
    ).pipe(take(1)).subscribe(([user, res]) => {
      const ref = this.af.firestore.collection(`/db/24multiservicios/productsList`).doc(this.data.item.id);
      this.af.firestore.runTransaction((transaction) => {
        return transaction.get(ref).then((prodDoc) => {
          let newStock = prodDoc.data().realStock + this.getStock();
          let newMerma = prodDoc.data().mermaStock + this.validatedFormGroup.value['mermaStock'];
          let discount = this.getStock() + this.validatedFormGroup.get('mermaStock').value
          let records = []
          transaction.update(ref, {
            mermaStock: newMerma,
            realStock: newStock
          })

          if (this.data.item.returnedRecord) {
            records = [...this.data.item.returnedRecord]
            records.push({
              date: new Date(),
              merma: this.validatedFormGroup.get('mermaStock').value,
              quantity: this.getStock()
            })
          } else {
            records.push({
              date: new Date(),
              merma: this.validatedFormGroup.get('mermaStock').value,
              quantity: this.getStock()
            })
          }

          transaction.update(requestRef, {
            validated: res.validated,
            validatedDate: res.validated ? new Date() : null,
            editedDate: res.validated ? new Date() : null,
            editedBy: res.validated ? user : null,
            returnedValidated: res.returnedValidated,
            returnedDate: res.returnedValidated ? new Date() : null,
            status: res.validated ? 'validado' : 'pendiente',
            returnedStatus: res.returnedValidated ? 'validado' : 'pendiente'
          })

          transaction.update(requestProductRef, {
            validated: this.validatedFormGroup.get('returned').value == 0,
            validatedStatus: this.validatedFormGroup.get('returned').value == 0 ? 'validado' : 'pendiente',
            validatedDate: this.validatedFormGroup.get('returned').value == 0 ? new Date() : null,
            returnedStatus: this.validatedFormGroup.get('returned').value == 0 ? 'validado' : 'pendiente',
            returnedQuantity: this.validatedFormGroup.get('returned').value,
            returnedValidated: this.validatedFormGroup.get('returned').value == 0,
            returnedDate: new Date(),
            returnedRecord: records
          })

          

        });
      }).then(() => {
        this.loading.next(false)
        this.dialogRef.close()
        this.snackBar.open(
          'Producto validado',
          'Cerrar',
          { duration: 6000, }
        );

      }).catch(error => {
        this.snackBar.open(
          'Ocurrió un error. Por favor, vuelva a intentarlo.',
          'Cerrar',
          { duration: 6000, }
        );
      })



    })

  }
}
