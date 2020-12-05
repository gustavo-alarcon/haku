import { AngularFireStorage } from '@angular/fire/storage';
import { AngularFirestore, DocumentReference } from '@angular/fire/firestore';
import { take, switchMap, takeLast } from 'rxjs/operators';
import { Ng2ImgMaxService } from 'ng2-img-max';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatabaseService } from 'src/app/core/services/database.service';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Observable, BehaviorSubject, of, concat } from 'rxjs';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Component, OnInit, Inject } from '@angular/core';

@Component({
  selector: 'app-create-pay',
  templateUrl: './create-pay.component.html',
  styleUrls: ['./create-pay.component.scss']
})
export class CreatePayComponent implements OnInit {
  loading = new BehaviorSubject<boolean>(false)
  loading$ = this.loading.asObservable()

  payForm: FormGroup

  noImage = '../../../../assets/svg/no-image.svg';

  photos: {
    resizing$: {
      photoURL: Observable<boolean>,
    },
    data: {
      photoURL: File,
    }
  } = {
      resizing$: {
        photoURL: new BehaviorSubject<boolean>(false),
      },
      data: {
        photoURL: null,
      }
    }

  constructor(
    private dialogRef: MatDialogRef<CreatePayComponent>,
    private fb: FormBuilder,
    private dbs: DatabaseService,
    private snackBar: MatSnackBar,
    private ng2ImgMax: Ng2ImgMaxService,
    private afs: AngularFirestore,
    private storage: AngularFireStorage,
    @Inject(MAT_DIALOG_DATA) public data: { item: any, edit: boolean }
  ) { }

  ngOnInit(): void {
    if (this.data.edit) {
      this.payForm = this.fb.group({
        name: [this.data.item.name, Validators.required],
        account: [this.data.item.account, Validators.required],
        photoURL: [this.data.item.photoURL, Validators.required],
      })
    } else {
      this.payForm = this.fb.group({
        name: [null, Validators.required],
        account: [null, Validators.required],
        photoURL: [null, Validators.required],
      })
    }
  }

  addNewPhoto(formControlName: string, image: File[]) {
    this.payForm.get(formControlName).setValue(null);
    if (image.length === 0)
      return;
    //this.tempImage = image[0];
    let reader = new FileReader();

    this.photos.resizing$[formControlName].next(true);

    this.ng2ImgMax.resizeImage(image[0], 10000, 426)
      .pipe(
        take(1)
      ).subscribe(
        result => {
          this.photos.data[formControlName] = new File([result], formControlName + result.name.match(/\..*$/));

          reader.readAsDataURL(image[0]);
          reader.onload = (_event) => {
            this.payForm.get(formControlName).setValue(reader.result);
            this.photos.resizing$[formControlName].next(false);
          }
        },
        error => {
          this.photos.resizing$[formControlName].next(false);
          this.snackBar.open('Por favor, elija una imagen en formato JPG, o PNG', 'Aceptar');
          this.payForm.get(formControlName).setValue(null);

        }
      );
  }

  uploadPhoto(id: string, file: File): Observable<string | number> {
    const path = `/configuration/pictures/${id}-${file.name}`;

    // Reference to storage bucket
    const ref = this.storage.ref(path);

    // The main task
    let uploadingTask = this.storage.upload(path, file);

    let snapshot$ = uploadingTask.percentageChanges()
    let url$ = of('url!').pipe(
      switchMap((res) => {
        return <Observable<string>>ref.getDownloadURL();
      }))

    let upload$ = concat(
      snapshot$,
      url$)

    return upload$;
  }

  createBanner(typePay, photo?: File) {
    const payRef: DocumentReference = this.afs.firestore.collection(`/db/haku/config/`).doc('generalConfig');

    typePay.photoURL = null;

    this.uploadPhoto(typePay.name, photo).pipe(
      takeLast(1),
    ).subscribe((res: string) => {
      typePay.photoURL = res;
      typePay.photoPath = `/configuration/pictures/${typePay.name}-${photo.name}`;

      return this.afs.firestore.runTransaction((transaction) => {
        return transaction.get(payRef).then((doc) => {
          if (!doc.exists) {
            transaction.set(payRef, { payments: [] });
          }

          const payments = doc.data().payments ? doc.data().payments : [];
          payments.unshift(typePay);
          transaction.update(payRef, { payments: payments });
        });

      }).then(() => {
        this.dialogRef.close(true);
        this.snackBar.open("Elemento guardado", "Cerrar", {
          duration: 4000
        })
        this.loading.next(false)
      }).catch(function (error) {
        console.log("Transaction failed: ", error);
      });

    })

  }

  editBanner(typePay, photo?: File) {
    const payRef: DocumentReference = this.afs.firestore.collection(`/db/haku/config/`).doc('generalConfig');

    if (photo) {
      concat(
        this.dbs.deletePhotoProduct(this.data.item.photoPath).pipe(takeLast(1)),
        this.uploadPhoto(typePay.name, photo).pipe(takeLast(1))
      ).pipe(
        takeLast(1),
      ).subscribe((res: string) => {
        typePay.photoURL = res;
        typePay.photoPath = `/configuration/pictures/${typePay.name}-${photo.name}`;
        return this.afs.firestore.runTransaction((transaction) => {
          // This code may get re-run multiple times if there are conflicts.
          return transaction.get(payRef).then((doc) => {
            if (!doc.exists) {
              transaction.set(payRef, { payments: [] });
            }

            const payments = doc.data().payments ? doc.data().payments : [];

            let ind = payments.findIndex(el => el.name == this.data.item.name)
            payments[ind] = typePay
            transaction.update(payRef, { payments: payments });

          });

        }).then(() => {
          this.dialogRef.close(true)
          this.loading.next(false)
          this.snackBar.open("Elemento editado", "Cerrar", {
            duration: 4000
          })
        }).catch(function (error) {
          console.log("Transaction failed: ", error);
        });
      })

    } else {
      return this.afs.firestore.runTransaction((transaction) => {
        return transaction.get(payRef).then((doc) => {
          if (!doc.exists) {
            transaction.set(payRef, { payments: [] });
          }

          const payments = doc.data().payments ? doc.data().payments : [];

          let ind = payments.findIndex(el => el.name == this.data.item.name)
          payments[ind] = typePay
          transaction.update(payRef, { payments: payments });

        });

      }).then(() => {
        this.dialogRef.close(true);
        this.snackBar.open("Elemento editado", "Cerrar", {
          duration: 4000
        })
        this.loading.next(false)
      }).catch(function (error) {
        console.log("Transaction failed: ", error);
      });
    }


  }

  save() {
    this.payForm.markAsPending();
    this.payForm.disable()
    this.loading.next(true)

    let newTypePay = this.payForm.value

    if (this.data.edit) {
      if (this.payForm.get('photoURL').value != this.data.item.photoURL) {
        this.editBanner(newTypePay, this.photos.data.photoURL)
      } else {
        if (this.payForm.get('name').value != this.data.item.name || this.payForm.get('account').value != this.data.item.account) {
          newTypePay['photoPath'] = this.data.item['photoPath']
          this.editBanner(newTypePay)
        } else {
          this.dialogRef.close()
        }
      }


    } else {

      this.createBanner(newTypePay, this.photos.data.photoURL)
    }


  }

}
