import { Component, OnInit, Inject } from '@angular/core';
import { FormGroup, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { DatabaseService } from 'src/app/core/services/database.service';
import { Product } from 'src/app/core/models/product.model';
import { of, Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map, startWith, tap, debounceTime, distinctUntilChanged, filter, take } from 'rxjs/operators';
import { Ng2ImgMaxService } from 'ng2-img-max';
import { ProductConfigCategoriesComponent } from '../product-config-categories/product-config-categories.component';
import { MatDialogRef, MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { User } from 'src/app/core/models/user.model';
import { Unit } from 'src/app/core/models/unit.model';
import { ProductConfigUnitsComponent } from '../product-config-units/product-config-units.component';

@Component({
  selector: 'app-product-create-edit',
  templateUrl: './product-create-edit.component.html',
  styleUrls: ['./product-create-edit.component.scss']
})
export class ProductCreateEditComponent implements OnInit {
  productForm: FormGroup

  descriptionFormatting$: Observable<string>
  skuFormatting$: Observable<string>
  refState$: Observable<boolean>
  category$: Observable<string[]>
  units$: Observable<Unit[]>
  unitRef$: Observable<string[]>

  //variables
  units: Unit[];

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
    private dialogRef: MatDialogRef<ProductCreateEditComponent>,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private dbs: DatabaseService,
    private snackBar: MatSnackBar,
    private ng2ImgMax: Ng2ImgMaxService,
    @Inject(MAT_DIALOG_DATA) public data: { data: Product, edit: boolean, sku: string }
  ) { }

  ngOnInit() {
    this.initForm();
    this.initObservables();
  }

  initForm() {
    //console.log(this.data);
    if (this.data.edit) {
      this.productForm = this.fb.group({
        description: this.fb.control(this.data.data.description, {
          validators: [Validators.required],
          asyncValidators: this.descriptionRepeatedValidator(this.dbs, this.data),
          updateOn: 'blur'
        }),
        sku: this.fb.control(this.data.data.sku, {
          validators: [Validators.required],
          asyncValidators: this.skuRepeatedValidator(this.dbs, this.data),
          updateOn: 'blur'
        }),
        additionalDescription: [this.data.data.additionalDescription],
        category: [this.data.data.category, Validators.required],
        price: [this.data.data.price, [Validators.required, Validators.min(0)]],
        unit: [this.data.data.unit, Validators.required],
        realStock: [this.data.data.realStock, [Validators.required, Validators.min(0)]],
        mermaStock: [this.data.data.mermaStock, [Validators.required, Validators.min(0)]],
        sellMinimum: [this.data.data.sellMinimum,
        [Validators.required, Validators.min(0), , this.minimumSellValidator()]],
        alertMinimum: [this.data.data.alertMinimum,
        [Validators.required, Validators.min(0), , this.minimumSellValidator()]],
        saleType: [this.data.data.saleType ? this.data.data.saleType : '1', Validators.required],
        calcStock: [this.data.data.calcStock ? this.data.data.calcStock : '2', Validators.required],
        photoURL: [this.data.data.photoURL, Validators.required],
      })
    }
    else {
      this.productForm = this.fb.group({
        description: this.fb.control(null, {
          validators: [Validators.required],
          asyncValidators: this.descriptionRepeatedValidator(this.dbs, this.data),
          updateOn: 'blur'
        }),
        sku: this.fb.control(this.data.sku ? this.data.sku : null, {
          validators: [Validators.required],
          asyncValidators: this.skuRepeatedValidator(this.dbs, this.data),
          updateOn: 'blur'
        }),
        additionalDescription: [null],
        category: [null, Validators.required],
        price: [null, [Validators.required, Validators.min(0)]],
        unit: [null, Validators.required],
        realStock: [0, [Validators.required, Validators.min(0)]],
        mermaStock: [0, [Validators.required, Validators.min(0)]],
        sellMinimum: [0,
          [Validators.required, Validators.min(0), , this.minimumSellValidator()]],
        alertMinimum: [0,
          [Validators.required, Validators.min(0), , this.minimumSellValidator()]],
        saleType: ['1', Validators.required],
        calcStock: ['2', Validators.required],
        photoURL: [null, Validators.required],
      })
    }
  }
  deb() {
    //console.log(this.productForm);
  }
  initObservables() {
    this.descriptionFormatting$ = this.productForm.get('description').valueChanges.pipe(
      distinctUntilChanged(),
      filter((desc: string) => {
        return /(\S*\s)\s+/g.test(desc);
      }),
      tap((desc: string) => {
        this.productForm.get('description').setValue(
          desc.trim().replace(/(\S*\s)\s+/g, '$1')
        )
      }))

    this.skuFormatting$ = this.productForm.get('sku').valueChanges.pipe(
      filter((desc: string) => {
        return /\s+/g.test(desc);
      }),
      tap((desc: string) => {
        //console.log('skuformat')
        this.productForm.get('sku').setValue(
          desc.match(/\S/g).join("")
        )
      }))

    this.category$ = combineLatest(
      this.productForm.get('category').valueChanges.pipe(startWith('')),
      this.dbs.getProductsListCategoriesValueChanges().pipe(
        map(res => res.map(el => el['name']))
      )
    ).pipe(map(([formValue, categories]) => {
      let filter = categories.filter(el => el.match(new RegExp(formValue, 'ig')));
      if (!(filter.length == 1 && filter[0] === formValue) && formValue.length) {
        this.productForm.get('category').setErrors({ invalid: true });
      }
      return filter;
    }))

    this.units$ = this.dbs.getProductsListUnitsValueChanges().pipe(
      take(1),
      tap(unit => {
        if (this.data.edit) {
          let selectedUnit = unit.find(el => el.description == this.data.data.unit.description);
          this.productForm.get('unit').setValue(selectedUnit)
        }
      }));
  }

  onAddCategory() {
    this.dialog.open(ProductConfigCategoriesComponent);
  }

  onAddUnit() {
    this.dialog.open(ProductConfigUnitsComponent);
  }

  //Photo
  addNewPhoto(formControlName: string, image: File[]) {
    this.productForm.get(formControlName).setValue(null);
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
            this.productForm.get(formControlName).setValue(reader.result);
            this.photos.resizing$[formControlName].next(false);
          }
        },
        error => {
          this.photos.resizing$[formControlName].next(false);
          this.snackBar.open('Por favor, elija una imagen en formato JPG, o PNG', 'Aceptar');
          this.productForm.get(formControlName).setValue(null);

        }
      );
  }

  onSubmitForm(user: User) {
    this.productForm.markAsPending();

    let product: Product = {
      id: null,
      description: this.productForm.get('description').value.trim().toLowerCase(),
      additionalDescription: this.productForm.get('additionalDescription').value ? this.productForm.get('additionalDescription').value.trim() : '',
      sku: this.productForm.get('sku').value,
      category: this.productForm.get('category').value,
      price: this.productForm.get('price').value,
      unit: this.productForm.get('unit').value,
      realStock: this.productForm.get('realStock').value,
      mermaStock: this.productForm.get('mermaStock').value,
      sellMinimum: this.productForm.get('sellMinimum').value,
      alertMinimum: this.productForm.get('alertMinimum').value,
      photoURL: this.productForm.get('photoURL').value,
      photoPath: this.data.edit ? this.data.data.photoPath : null,
      promo: this.data.edit ? this.data.data.promo : false,
      promoData: this.data.edit ? this.data.data.promoData : null,
      published: this.data.edit ? this.data.data.published : null,
      priority: this.data.edit ? this.data.data.priority : 1, 
      saleType: this.productForm.get('saleType').value,
      calcStock: this.productForm.get('calcStock').value,
      createdAt: this.data.edit ? this.data.data.createdAt : new Date(),
      createdBy: this.data.edit ? this.data.data.createdBy : user,
      editedAt: this.data.edit ? new Date() : null,
      editedBy: this.data.edit ? user : null,
    }

    this.dbs.createEditProduct(this.data.edit, product, this.data.data, this.photos.data.photoURL)
      .subscribe(batch => {
        batch.commit().then(res => {
          this.dialogRef.close(true);
        },
          err => {
            // console.log(err)
            this.dialogRef.close(false);
          })
      },
        err => {
          // console.log(err)
          this.dialogRef.close(false);
        });
  }

  minimumSellValidator() {
    return (control: AbstractControl): { 'sellMinimumExceeded': boolean } => {
      if (control.parent) {
        if (control.parent.get('sellMinimum').value >= control.parent.get('alertMinimum').value) {
          if (control.parent.get('sellMinimum').value && control.parent.get('alertMinimum').value) {
            return { 'sellMinimumExceeded': true }
          }
          return null
        } else {
          return null
        }
      } else {
        return null
      }

    }
  }

  descriptionRepeatedValidator(dbs: DatabaseService, data: { data: Product, edit: boolean }) {
    return (control: AbstractControl): Observable<{ 'descriptionRepeatedValidator': boolean }> => {
      const value = control.value.toUpperCase();
      if (data.edit) {
        if (data.data.description.toUpperCase() == value) {
          return of(null)
        }
        else {
          return dbs.getProductsList().pipe(
            map(res => !!res.find(el => el.description.toUpperCase() == value) ? { descriptionRepeatedValidator: true } : null))
        }
      }
      else {
        return dbs.getProductsList().pipe(
          map(res => !!res.find(el => el.description.toUpperCase() == value) ? { descriptionRepeatedValidator: true } : null))
      }
    }
  }

  skuRepeatedValidator(dbs: DatabaseService, data: { data: Product, edit: boolean }) {
    return (control: AbstractControl): Observable<{ 'skuRepeatedValidator': boolean }> => {
      const value = control.value.toUpperCase();
      if (data.edit) {
        if (data.data.sku.toUpperCase() == value) {
          return of(null)
        }
        else {
          return dbs.getProductsList().pipe(
            map(res => !!res.find(el => el.sku.toUpperCase() == value) ? { skuRepeatedValidator: true } : null))
        }
      }
      else {
        return dbs.getProductsList().pipe(
          map(res => !!res.find(el => el.sku.toUpperCase() == value) ? { skuRepeatedValidator: true } : null))
      }
    }
  }

}
