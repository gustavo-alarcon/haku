import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Ticket } from 'src/app/core/models/ticket.model';
import { AuthService } from 'src/app/core/services/auth.service';
import { Observable } from 'rxjs';
import { User } from 'src/app/core/models/user.model';

import * as firebase from 'firebase';
import { DatabaseService } from 'src/app/core/services/database.service';
import { AngularFirestore } from '@angular/fire/firestore';
import { Product } from 'src/app/core/models/product.model';
import { take } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-pos-saving',
  templateUrl: './pos-saving.component.html',
  styleUrls: ['./pos-saving.component.scss']
})
export class PosSavingComponent implements OnInit {

  user$: Observable<User>;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { ticket: Ticket, payment: number, paymentMethod: any },
    private dialogRef: MatDialogRef<PosSavingComponent>,
    public auth: AuthService,
    private dbs: DatabaseService,
    private af: AngularFirestore,
    private snackbar: MatSnackBar
  ) { }

  ngOnInit(): void {
    this.user$ = this.auth.user$;
    this.save();
  }

  close(): void {
    this.dialogRef.close();
  }

  save(): any {
    // Create a reference for a new rating, for use inside the transaction
    let productListRef = this.af.firestore.collection('db/24multiservicios/productsList');

    let transactionsArray = [];

    this.data.ticket.productList.forEach(item => {

      if (item.product.id) {
        transactionsArray.push(
          this.af.firestore.runTransaction(t => {
            return t.get(productListRef.doc(item.product.id))
              .then(doc => {
                if (doc.exists) {
                  let newStock = doc.data().realStock - item.quantity;

                  if (doc.data().calcStock !== '1') {
                    return true
                  } else {
                    if (newStock >= 0) {
                      t.update(productListRef.doc(item.product.id), { realStock: newStock });
                      return true;
                    } else {
                      return false;
                    }
                  }

                }

              })
              .catch(err => {
                console.log(err);
                return false;
              })
          })
        )
      }

    });


    Promise.all(transactionsArray)
      .then(res => {
        let failedItems = [];
        let rightItems = [];
        res.forEach((el, index) => {
          if (!el) {
            failedItems.push(index);
          } else {
            rightItems.push(index);
          }
        });

        this.auth.user$.pipe(take(1))
          .subscribe(user => {
            let configRef = this.af.firestore.doc('/db/24multiservicios/config/generalConfig');

            this.af.firestore.runTransaction(t => {
              return t.get(configRef)
                .then(doc => {
                  let newCorr = doc.data().correlativeStore + 1;

                  let saleDocRef = this.af.firestore.collection('/db/24multiservicios/storeSales').doc();

                  let newData = {
                    id: saleDocRef.id,
                    ticket: this.data.ticket,
                    payment: this.data.payment,
                    paymentMethod: this.data.paymentMethod,
                    status: failedItems.length > 0 ? 'Fallido' : 'Pagado',
                    failedItems: failedItems,
                    rightItems: rightItems,
                    correlative: newCorr,
                    createdBy: user,
                    createdAt: new Date()
                  }

                  t.set(saleDocRef, newData);
                  t.update(configRef, { correlativeStore: newCorr });

                  this.dialogRef.close({ list: failedItems, correlative: newCorr });
                })
            }).then(() => {
              console.log('transaction commited');
            }).catch(err => console.log(err))
          })
      })
      .catch(err => console.log(err))
  }

}
