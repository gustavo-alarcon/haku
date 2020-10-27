import { Component, OnInit, Inject } from '@angular/core';
import { FormArray, FormBuilder } from '@angular/forms';
import { Ng2ImgMaxService } from 'ng2-img-max';
import { take, takeLast, tap, switchMap } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Sale, saleStatusOptions } from 'src/app/core/models/sale.model';
import { combineLatest, forkJoin, throwError, BehaviorSubject } from 'rxjs';
import { DatabaseService } from 'src/app/core/services/database.service';
import { User } from 'src/app/core/models/user.model';


@Component({
  selector: 'app-sales-photo-dialog',
  templateUrl: './sales-photo-dialog.component.html',
  styleUrls: ['./sales-photo-dialog.component.scss']
})
export class SalesPhotoDialogComponent implements OnInit {
  saleStatusOptions = new saleStatusOptions()

  defaultImage = "../../../../assets/images/24multi-vertical-logo.png";

  photoFormArray: FormArray = new FormArray([])
  loading$: BehaviorSubject<boolean> = new BehaviorSubject(false);

  noImage = '../../../../assets/svg/no-image.svg'

  constructor(
    private ng2ImgMax: Ng2ImgMaxService,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<SalesPhotoDialogComponent>,
    private dbs: DatabaseService,
    @Inject(MAT_DIALOG_DATA) public data: { data: Sale, user: User }
  ) { }

  ngOnInit(): void {
    //console.log(this.data.data)
    this.initForm();
  }

  initForm(){
    this.data.data.voucher.forEach(voucher => {
      this.photoFormArray.push(this.fb.group({
        photoURL: [voucher.voucherPhoto],
        photoPath: [voucher.voucherPath],
        photoFile: [],
        resizing: []
      }))
    })
  }

  //Photo
  addNewPhoto(formControlIndex: number, image: File[]) {
    this.loading$.next(true);
    if(this.photoFormArray.controls.length == formControlIndex){
      this.photoFormArray.push(this.fb.group({
        photoURL: [null],
        photoPath: [null],
        photoFile: [null],
        resizing: [null]
      }))
    }
    this.photoFormArray.controls[formControlIndex].get('photoURL').setValue(null);
    this.photoFormArray.controls[formControlIndex].get('photoFile').setValue(null);
    this.photoFormArray.controls[formControlIndex].get('photoPath').setValue(null);

    if (image.length === 0)
      return;

    let reader = new FileReader();

    this.photoFormArray.controls[formControlIndex].get('resizing').setValue(true);
  
    this.ng2ImgMax.resizeImage(image[0], 10000, 426)
      .pipe(
        take(1)
      ).subscribe(
        result => {
          this.photoFormArray.controls[formControlIndex].get('photoFile')
            .setValue(new File([result], "photoURL"+ this.getRandomNumber() + result.name.match(/\..*$/)));

          reader.readAsDataURL(image[0]);
          reader.onload = (_event) => {

            this.photoFormArray.controls[formControlIndex].get('photoURL')
              .setValue(reader.result);

            this.photoFormArray.controls[formControlIndex].get('resizing').setValue(false);
            this.loading$.next(false);
          }
        },
        error => {
          this.photoFormArray.controls[formControlIndex].get('resizing').setValue(false);
          this.loading$.next(false);
          this.snackBar.open('Por favor, elija una imagen en formato JPG, o PNG', 'Aceptar');
        }
      );
  }

  getRandomNumber(): string{
    return Math.floor(Math.random()*100000).toString()
  }

  deletePhoto(formControlIndex: number){
    this.photoFormArray.removeAt(formControlIndex);
  }

  deb(){
    //console.log(this.photoFormArray);
  }

  onSubmitForm(){
    if(this.photoFormArray.controls.find(el => !el.get('photoPath').value)){
      this.loading$.next(true);

      let photos: Sale['voucher'] = []

      let deletedPhotos: Sale['voucher'] = this.data.data.voucher.filter(voucher => 
        !this.photoFormArray.controls.find(el => el.get('photoPath').value == voucher.voucherPath)
      )

      combineLatest(
        ...this.photoFormArray.controls.filter(group => !group.get('photoPath').value)
        .map(group => 
          this.dbs.uploadPhotoVoucher(this.data.data.id, group.get('photoFile').value)
          .pipe(
            takeLast(1),
            tap(url => {
              group.get('photoURL').setValue(url);
              group.get('photoPath').setValue(
                `/sales/vouchers/${this.data.data.id}-${group.get('photoFile').value.name}`
              )
            })
          )
        ),
        ...deletedPhotos.map(el => this.dbs.deletePhotoProduct(el.voucherPath))
      ).pipe(
        switchMap((res) => {
          photos = this.photoFormArray.value.map(el => ({
            voucherPath: el.photoPath,
            voucherPhoto: el.photoURL
          }))

          return this.dbs.onUpdateSaleVoucher(this.data.data.id, false, this.data.user, photos).commit()
          .then(()=> {
            this.snackBar.open('Los vouchers fueron actualizados satisfactoriamente', 'Aceptar');
          })
          .catch(err => {
            throwError(err)
          })
        })
      )
      .subscribe(
        (res) => {
          let newSale: Sale =this.data.data;
          newSale.voucherChecked = false;
          newSale.voucher = photos;
          //console.log(newSale);
          this.dialogRef.close(newSale);
        },
        (err) => {
          this.loading$.next(false);
          console.log(err);
          this.snackBar.open('Ocurrió un error. Vuelva a intentarlo.', 'Aceptar');
        }
      )
    } else {
      this.dialogRef.close(null);
    }
  }
}
