import { AngularFireStorage } from '@angular/fire/storage';
import { AngularFirestore, DocumentReference } from '@angular/fire/firestore';
import { take, switchMap, takeLast, map } from 'rxjs/operators';
import { Ng2ImgMaxService } from 'ng2-img-max';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatabaseService } from 'src/app/core/services/database.service';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Observable, BehaviorSubject, of, concat } from 'rxjs';
import { FormGroup, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { Component, OnInit, Inject } from '@angular/core';
@Component({
  selector: 'app-create-category',
  templateUrl: './create-category.component.html',
  styleUrls: ['./create-category.component.scss']
})
export class CreateCategoryComponent implements OnInit {
  loading = new BehaviorSubject<boolean>(false)
  loading$ = this.loading.asObservable()

  categoryForm: FormGroup

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
    private dialogRef: MatDialogRef<CreateCategoryComponent>,
    private fb: FormBuilder,
    private dbs: DatabaseService,
    private snackBar: MatSnackBar,
    private ng2ImgMax: Ng2ImgMaxService,
    private afs: AngularFirestore,
    private storage: AngularFireStorage,
    @Inject(MAT_DIALOG_DATA) public data: { item: any, edit: boolean, index: number }
  ) { }

  ngOnInit(): void {
    if (this.data.edit) {
      this.categoryForm = this.fb.group({
        name: [this.data.item.name, Validators.required],
        photoURL: [this.data.item.photoURL, Validators.required]
      })
    } else {
      this.categoryForm = this.fb.group({
        name: [null, [Validators.required], [this.repeatedValidator()]],
        photoURL: [null, Validators.required]
      })
    }


  }

  repeatedValidator() {
    return (control: AbstractControl) => {
      const value = control.value.toLowerCase();
      return this.dbs.getCategoriesDoc().pipe(
        map(res => {
          return res?.findIndex(el => el['name'].toLowerCase() == value) >= 0 ? { repeatedValidator: true } : null
        }))
    }
  }

  addNewPhoto(formControlName: string, image: File[]) {
    this.categoryForm.get(formControlName).setValue(null);
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
            this.categoryForm.get(formControlName).setValue(reader.result);
            this.photos.resizing$[formControlName].next(false);
          }
        },
        error => {
          this.photos.resizing$[formControlName].next(false);
          this.snackBar.open('Por favor, elija una imagen en formato JPG, o PNG', 'Aceptar');
          this.categoryForm.get(formControlName).setValue(null);

        }
      );
  }

  uploadPhoto(id: string, file: File): Observable<string | number> {
    const path = `/categories/pictures/${id}-${file.name}`;

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

  createBanner(categorie, photo?: File) {
    const payRef: DocumentReference = this.afs.firestore.collection(`/db/haku/config/`).doc('generalConfig');

    categorie.photoURL = null;

    this.uploadPhoto(categorie.name, photo).pipe(
      takeLast(1),
    ).subscribe((res: string) => {
      categorie.photoURL = res;
      categorie.photoPath = `/categories/pictures/${categorie.name}-${photo.name}`;

      return this.afs.firestore.runTransaction((transaction) => {
        return transaction.get(payRef).then((doc) => {
          if (!doc.exists) {
            transaction.set(payRef, { categories: [] });
          }

          const list = doc.data().categories ? doc.data().categories : [];
          list.push(categorie);
          transaction.update(payRef, { categories: list });
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

  editBanner(category, photo?: File) {
    const payRef: DocumentReference = this.afs.firestore.collection(`/db/haku/config/`).doc('generalConfig');

    if (photo) {
      concat(
        this.dbs.deletePhotoProduct(this.data.item.photoPath).pipe(takeLast(1)),
        this.uploadPhoto(category.name, photo).pipe(takeLast(1))
      ).pipe(
        takeLast(1)
      ).subscribe((res: string) => {
        category.photoURL = res;
        category.photoPath = `/categories/pictures/${category.name}-${photo.name}`;

        this.afs.firestore.runTransaction((transaction) => {
          // This code may get re-run multiple times if there are conflicts.
          return transaction.get(payRef).then((doc) => {
            if (!doc.exists) {
              transaction.set(payRef, { categories: [] });
            }
            else {
              const list = doc.data().categories ? doc.data().categories : [];

              let ind = list.findIndex(el => el.name == this.data.item.name);
              list[ind] = category;
              transaction.update(payRef, { categories: list });
            }
          });

        });

        this.dialogRef.close(true);
        this.loading.next(false);
        this.snackBar.open("Elemento editado", "Cerrar", {
          duration: 4000
        });

      });

    } else {
      return this.afs.firestore.runTransaction((transaction) => {
        return transaction.get(payRef).then((doc) => {
          if (!doc.exists) {
            transaction.set(payRef, { categories: [] });
          }
          const list = doc.data().categories ? doc.data().categories : [];

          let ind = list.findIndex(el => el.name == this.data.item.name)
          list[ind] = category
          transaction.update(payRef, { categories: list });

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
    this.categoryForm.markAsPending();
    this.categoryForm.disable()
    this.loading.next(true)

    let newCategory = {
      name: this.categoryForm.value['name'],
      photoURL: this.categoryForm.value['photoURL'],
      photoPath: this.data.item ? this.data.item['photoPath'] : '',
      index: this.data.index
    }

    if (this.data.edit) {
      if (this.categoryForm.get('photoURL').value != this.data.item.photoURL) {
        this.editBanner(newCategory, this.photos.data.photoURL)
      } else {
        if (this.categoryForm.get('name').value != this.data.item.name) {
          this.editBanner(newCategory)
        } else {
          this.dialogRef.close()
        }
      }
    } else {
      this.createBanner(newCategory, this.photos.data.photoURL)
    }

  }

}
