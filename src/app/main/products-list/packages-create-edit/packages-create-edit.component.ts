import { Component, OnInit, Inject } from '@angular/core';
import { FormGroup, FormBuilder, Validators, AbstractControl, FormArray } from '@angular/forms';
import {COMMA, ENTER} from '@angular/cdk/keycodes';
import { MatDialogRef, MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DatabaseService } from 'src/app/core/services/database.service';
import { Product } from 'src/app/core/models/product.model';
import { of, Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map, startWith, tap, debounceTime, distinctUntilChanged, filter, take } from 'rxjs/operators';
import { Ng2ImgMaxService } from 'ng2-img-max';
import { ProductConfigCategoriesComponent } from '../product-config-categories/product-config-categories.component';
import { User } from 'src/app/core/models/user.model';
import { PackageUnit } from 'src/app/core/models/unit.model';
import { ProductConfigUnitsComponent } from '../product-config-units/product-config-units.component';
import { Package } from 'src/app/core/models/package.model';
import { MatAutocomplete } from '@angular/material/autocomplete';
import { MatChipInputEvent } from '@angular/material/chips';
import { PackagesConfigUnitsComponent } from '../packages-config-units/packages-config-units.component';

@Component({
  selector: 'app-packages-create-edit',
  templateUrl: './packages-create-edit.component.html',
  styleUrls: ['./packages-create-edit.component.scss']
})
export class PackagesCreateEditComponent implements OnInit {
  //Variables
  packageForm: FormGroup;
  dateType = ["Definida", "Indefinida"];
  itemsFormArray: FormArray;
  dateLimit = new Date(Date.now() + 8.64e+7)
  maxItems = Array.from(Array(8), (_, i) => i + 1);

  descriptionFormatting$: Observable<string>
  skuFormatting$: Observable<string>
  units$: Observable<PackageUnit[]>
  category$: Observable<string[]>
  dateType$: Observable<boolean>
  totalItems$: Observable<number>
  productsList$: Observable<Product[]>
  productsListAutocompletes$: Observable<Product[]>[];

  noImage = '../../../../assets/images/no-image.png';
  separatorKeysCodes: number[] = [ENTER, COMMA];

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
    private dialogRef: MatDialogRef<PackagesCreateEditComponent>,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private dbs: DatabaseService,
    private snackBar: MatSnackBar,
    private ng2ImgMax: Ng2ImgMaxService,
    @Inject(MAT_DIALOG_DATA) public data: { data: Package, edit: boolean }
  ) { }

  ngOnInit() {
    this.initForm();
    this.initObservables();
  }

  initForm() {
    this.itemsFormArray = this.fb.array([])
    
    if (this.data.edit) {
      let date = new Date(1970)
      if(this.data.data.dateLimit){
        date.setSeconds(this.data.data.dateLimit['seconds'])
      }
      this.data.data.items.forEach(el => {
        this.itemsFormArray.push(this.fb.group({
          textInput: [''],
          quantityInput: [1],
          productsOptions: [el.productsOptions, this.minInputsValidator()]
        }))
      })

      this.packageForm = this.fb.group({
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
        unit: [this.data.data.unit, Validators.required],
        price: [this.data.data.price, [Validators.required, Validators.min(0)]],
        category: [this.data.data.category, Validators.required],
        dateType: [this.data.data.dateLimit ? this.dateType[0] : this.dateType[1], Validators.required],
        dateLimit: [
          {
            value: this.data.data.dateLimit ? date : null, 
            disabled: this.data.data.dateLimit ? false : true,
          }, Validators.required],
        totalItems: [this.data.data.totalItems, [Validators.required, Validators.min(1)]],
        photoURL: [this.data.data.photoURL, Validators.required],
      })
    }
    else {

      this.packageForm = this.fb.group({
        description: this.fb.control(null, {
          validators: [Validators.required],
          asyncValidators: this.descriptionRepeatedValidator(this.dbs, this.data),
          updateOn: 'blur'
        }),
        sku: this.fb.control(null, {
          validators: [Validators.required],
          asyncValidators: this.skuRepeatedValidator(this.dbs, this.data),
          updateOn: 'blur'
        }),
        unit: [null, Validators.required],
        price: [0, [Validators.required, Validators.min(0)]],
        category: [null, Validators.required],
        dateType: [null, Validators.required],
        dateLimit: [
          {
            value: null, 
            disabled: true,
          }, Validators.required],
        totalItems: [0, [Validators.required, Validators.min(1)]],
        photoURL: [null, Validators.required],
      })

    }
  }

  deb(){
    console.log(this.packageForm);
  }

  initObservables() {
    this.descriptionFormatting$ = this.packageForm.get('description').valueChanges.pipe(
      distinctUntilChanged(),
      filter((desc: string) => {
        return /(\S*\s)\s+/g.test(desc);
      }),
      tap((desc: string) => {
        this.packageForm.get('description').setValue(
          desc.trim().replace(/(\S*\s)\s+/g, '$1')
        )
      }))

    this.skuFormatting$ = this.packageForm.get('sku').valueChanges.pipe(
      filter((desc: string) => {
        return /\s+/g.test(desc);
      }),
      tap((desc: string) => {
        //console.log('skuformat')
        this.packageForm.get('sku').setValue(
          desc.match(/\S/g).join("")
        )
      }))

    this.units$ = this.dbs.getPackagesListUnitsValueChanges().pipe(
      take(1),
      tap(unit => {
      if(this.data.edit){
        let selectedUnit = unit.find(el => el.description == this.data.data.unit.description);
        this.packageForm.get('unit').setValue(selectedUnit)
      }
    }));

    this.category$ = combineLatest(
      this.packageForm.get('category').valueChanges.pipe(startWith('')),
      this.dbs.getProductsListCategoriesValueChanges().pipe(
        map(res => res.map(el => el['name']))
      )
    ).pipe(map(([formValue, categories]) => {
      let filter = categories.filter(el => el.match(new RegExp(formValue, 'ig')));
      if (!(filter.length == 1 && filter[0] === formValue) && formValue.length) {
        this.packageForm.get('category').setErrors({ invalid: true });
      }
      return filter;
    }))

    this.dateType$ = this.packageForm.get('dateType').valueChanges.pipe(
      startWith(this.packageForm.get('dateType').value),
      map(el => {
        if(el == this.dateType[0]){
          this.packageForm.get('dateLimit').enable()
          return true
        } else {
          this.packageForm.get('dateLimit').disable()
          return false
        }
      })
    )

    this.productsList$ = this.dbs.getProductsListValueChanges();

    this.totalItems$ = this.packageForm.get('totalItems').valueChanges.pipe(
      //startWith<number>(this.packageForm.get('totalItems').value),
      tap(total => {
        this.itemsFormArray.clear();
        for(let i=0; i<total; i++){
          this.itemsFormArray.push(this.fb.group({
            textInput: [''],
            quantityInput: [1],
            productsOptions: [[], this.minInputsValidator()]
          }))
        }
        this.updateProductsListAutocompletes();
      })
    )

    this.updateProductsListAutocompletes();
  }

  updateProductsListAutocompletes() {
    this.productsListAutocompletes$ = this.itemsFormArray.controls.map(group => {
        return combineLatest(
          group.get('textInput').valueChanges.pipe(startWith('')), 
          this.productsList$
          ).pipe(map(([formValue, products]) => {
            let filter = products.filter(el => el.description.match(new RegExp(formValue,'ig')));
            return filter;
          }))
      })
  }

  //Mat Chip
  onRemoveProduct(product: Product, formGroup: FormGroup){
    let removedList = (<Product[]>formGroup.get('productsOptions').value).filter(
      el => el.id != product.id
    )
    formGroup.get('productsOptions').setValue(removedList)
  }
/*
  onAddProduct(auto: MatAutocomplete, event: MatChipInputEvent, formGroup: FormGroup){
    let options = auto.options;
    if(options.length){
      //(options.first.value);
      this.onSelectProduct(options.first.value, formGroup)
    }
    event.input.value = "";
  }*/

  onSelectProduct( formGroup: FormGroup){
    let product=formGroup.get('textInput').value
    if(product){
      let quant=formGroup.get('quantityInput').value
    product['quantity'] = quant
    console.log(product);
    
    let initList = (<Product[]>formGroup.get('productsOptions').value);
    if(!initList.find(el => el.id == product.id)){
      initList.unshift(product)
      formGroup.get('productsOptions').setValue(initList);
    }
    formGroup.get('textInput').setValue("");
    formGroup.get('quantityInput').setValue(1);
    }
    
  }

  onAddUnit() {
    this.dialog.open(PackagesConfigUnitsComponent);
  }

  //Photo
  addNewPhoto(formControlName: string, image: File[]) {
    this.packageForm.get(formControlName).setValue(null);
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
            this.packageForm.get(formControlName).setValue(reader.result);
            this.photos.resizing$[formControlName].next(false);
          }
        },
        error => {
          this.photos.resizing$[formControlName].next(false);
          this.snackBar.open('Por favor, elija una imagen en formato JPG, o PNG', 'Aceptar');
          this.packageForm.get(formControlName).setValue(null);

        }
      );
  }

  onSubmitForm(user: User) {
    this.packageForm.markAsPending();

    let pack: Package = {
      package: true,
      id: null,
      description: this.packageForm.get('description').value.trim().toLowerCase(),
      additionalDescription: '',
      sku: this.packageForm.get('sku').value,
      price: this.packageForm.get('price').value,
      unit: this.packageForm.get('unit').value,
      category: this.packageForm.get('category').value,
      dateLimit: this.packageForm.get('dateType').value == this.dateType[0] ? 
        this.packageForm.get('dateLimit').value : null,
      totalItems: this.packageForm.get('totalItems').value,
      items: this.itemsFormArray.controls.map(el => ({productsOptions: el.get('productsOptions').value})),
      photoURL: this.packageForm.get('photoURL').value,
      photoPath: this.data.edit ? this.data.data.photoPath : null,
      promo: this.data.edit ? this.data.data.promo : false,
      promoData: this.data.edit ? this.data.data.promoData : null,
      published: this.data.edit ? this.data.data.published : null,
      priority: this.data.edit ? this.data.data.priority : 1,
      createdAt: this.data.edit ? this.data.data.createdAt : new Date(),
      createdBy: this.data.edit ? this.data.data.createdBy : user,
      editedAt: this.data.edit ? new Date() : null,
      editedBy: this.data.edit ? user : null,
    }

    this.dbs.createEditPackage(this.data.edit, pack, this.data.data, this.photos.data.photoURL)
      .subscribe(batch => {
        batch.commit().then(res => {      
          this.dialogRef.close(true);
        },
          err => {
            this.dialogRef.close(false);
          })
      },
        err => {
          this.dialogRef.close(false);
        });
  }

  descriptionRepeatedValidator(dbs: DatabaseService, data: {data: Package, edit: boolean}){
    return (control: AbstractControl): Observable<{'descriptionRepeatedValidator': boolean}> => {
      const value = control.value.toUpperCase();
      if(data.edit){
        if(data.data.description.toUpperCase() == value){
          return of(null)
        }
        else{
          return dbs.getPackagesList().pipe(
            map(res => !!res.find(el => el.description.toUpperCase() == value)  ? {descriptionRepeatedValidator: true} : null),)
          }
        }
      else{
        return dbs.getPackagesList().pipe(
          map(res => !!res.find(el => el.description.toUpperCase() == value)  ? {descriptionRepeatedValidator: true} : null),)
        }
    }
  }

  skuRepeatedValidator(dbs: DatabaseService, data: {data: Package, edit: boolean}){
    return (control: AbstractControl): Observable<{'skuRepeatedValidator': boolean}> => {
      const value = control.value.toUpperCase();
      if(data.edit){
        if(data.data.sku.toUpperCase() == value){
          return of(null)
        }
        else{
          return dbs.getPackagesList().pipe(
            map(res => !!res.find(el => el.sku.toUpperCase() == value)  ? {skuRepeatedValidator: true} : null),)
          }
        }
      else{
        return dbs.getPackagesList().pipe(
          map(res => !!res.find(el => el.sku.toUpperCase() == value)  ? {skuRepeatedValidator: true} : null),)
        }
    }
  }

  minInputsValidator(){
    return (control: AbstractControl): {'minInputsValidator': boolean} => {
      if(control){
        let packages = <Package[]>control.value;
        if(!packages.length){
          return {minInputsValidator: true}
        }
      }
      return null
    }
  }

  displayFn(input: Product) {
    if (!input) return '';
    return input.description;
  }

}
