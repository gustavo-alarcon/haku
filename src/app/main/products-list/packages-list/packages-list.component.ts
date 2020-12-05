import { Component, OnInit, ViewChild } from '@angular/core';
import { Observable, combineLatest, iif, of } from 'rxjs';
import { startWith, tap, map, share, switchMap, take } from 'rxjs/operators';
import { FormBuilder, FormControl } from '@angular/forms';
import * as XLSX from 'xlsx';


import { DatabaseService } from 'src/app/core/services/database.service';
import { AuthService } from 'src/app/core/services/auth.service';

import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';

import { Package } from 'src/app/core/models/package.model';
import { PackagesCreateEditComponent } from '../packages-create-edit/packages-create-edit.component';
import { ConfirmationDialogComponent } from '../../confirmation-dialog/confirmation-dialog.component';
import { DatePipe } from '@angular/common';
import { ProductEditPromoComponent } from '../product-edit-promo/product-edit-promo.component';
import { Category } from 'src/app/core/models/category.model';


@Component({
  selector: 'app-packages-list',
  templateUrl: './packages-list.component.html',
  styleUrls: ['./packages-list.component.scss']
})
export class PackagesListComponent implements OnInit {

  //Forms
  categoryForm: FormControl;
  itemsFilterForm: FormControl;
  promoFilterForm: FormControl;

  //Table
  packagesTableDataSource = new MatTableDataSource<Package>();
  packagesDisplayedColumns: string[] = [
    'index', 'photoURL', 'description', 'sku', 'category', 'items', 'price','dateLimit',
     'unitDescription', 
    'published', 'actions'
  ]

  packagesObservable$: Observable<Package[]>
  @ViewChild('packagesPaginator', { static: false }) set content(paginator1: MatPaginator) {
    this.packagesTableDataSource.paginator = paginator1;
  }

  //Observables
  categoryObservable$: Observable<[any, Category[]]>
  categoryList$: Observable<Category[]>
  filter$: Observable<boolean>


  //Variables
  defaultImage = "../../../assets/images/haku-lazy-image.png";

  //noResult
  noResult$: Observable<string>;
  noResultImage: string = '';

  categorySelected: boolean = false;

  constructor(
    private fb: FormBuilder,
    private dialog: MatDialog,
    public snackBar: MatSnackBar,
    private dbs: DatabaseService,
    public auth: AuthService,
    public datePipe: DatePipe
  ) { }

  ngOnInit(): void {
    this.initForms();
    this.initObservables();
  }

  initForms() {
    this.categoryForm = this.fb.control("");
    this.itemsFilterForm = this.fb.control("");
    this.promoFilterForm = this.fb.control(false);
  }

  initObservables() {
    this.packagesTableDataSource.filterPredicate =
      (data: Package, filter: string) => {
        let category = filter.trim().split('&+&')[0];   //category
        let name = filter.trim().split('&+&')[1];       //package name
        let promo = filter.trim().split('&+&')[2];                    //promo
        return (data.category.match(new RegExp(category, 'ig'))
          && data.description.match(new RegExp(name, 'ig'))
          && (String(data.promo) == promo || promo == "false"))
      }

    this.categoryObservable$ = combineLatest(
      this.categoryForm.valueChanges.pipe(startWith('')),
      this.dbs.getProductsListCategoriesValueChanges()
    ).pipe(share());

    this.categoryList$ = this.categoryObservable$.pipe(map(([formValue, categories]) => {
      // sanitazing form input
      let cleanFormValue = formValue.name ? formValue.name : '';
      // Flagging category selection
      this.categorySelected = formValue.name ? true : false;

      let filter = categories.filter(el => {
        return el.name.toLocaleLowerCase().includes(cleanFormValue.toLocaleLowerCase());
      });

      if (!(filter.length == 1 && filter[0] === formValue) && formValue.length) {
        this.categoryForm.setErrors({ invalid: true });
      }
      return filter;
    }));

    this.filter$ = combineLatest(
      this.categoryList$,
      this.itemsFilterForm.valueChanges.pipe(startWith('')),
      this.promoFilterForm.valueChanges.pipe(startWith(false)))
      .pipe(
        map(([categorySelected, itemsFormValue, promoFormValue]) => {
          this.packagesTableDataSource.filter = (categorySelected.length > 1 ? '' : categorySelected[0]?.name) + '&+&' + itemsFormValue + '&+&' + promoFormValue;
          return true
        })
      )

    this.packagesObservable$ = this.dbs.getPackagesListValueChanges().pipe(
      tap(res => {
        this.packagesTableDataSource.data = res;
      })
    )
  }

  showCategory(category: any): string | null {
    return category ? category.name : null
  }

  onPublish(pack: Package, publish: boolean) {
    let prod = { ...pack };
    prod.published = publish;
    this.dbs.publishPackage(publish, prod, null).commit().then(
      res => {
        this.snackBar.open('Paquete editado satisfactoriamente.', 'Aceptar');
      },
      err => {
        this.snackBar.open('Ocurrió un error. Vuelva a intentarlo.', 'Aceptar');
      }
    )

  }

  increasePriority(product: Package) {
    let prod = { ...product };
    prod.priority++;
    console.log(prod.priority);
    this.dbs.increasePriority(prod).commit().then(
      res => {
        this.snackBar.open('Prioridad incrementada', 'Aceptar');
      },
      err => {
        this.snackBar.open('Ocurrió un error. Vuelva a intentarlo.', 'Aceptar');
      }
    )

  }

  decreasePriority(product: Package) {
    let prod = { ...product };
    prod.priority--;
    console.log(prod.priority);
    this.dbs.decreasePriority(prod).commit().then(
      res => {
        this.snackBar.open('Prioridad reducida', 'Aceptar');
      },
      err => {
        this.snackBar.open('Ocurrió un error. Vuelva a intentarlo.', 'Aceptar');
      }
    )

  }

  onDeleteItem(pack: Package) {
    let dialogRef: MatDialogRef<ConfirmationDialogComponent>;
    dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      closeOnNavigation: true,
      disableClose: true,
      width: '360px',
      maxWidth: '360px',
      data: {
        warning: `El paquete será borrado.`,
        content: `¿Está seguro de borrar el paquete ${pack.description}?`,
        noObservation: true,
        observation: null,
        title: 'Borrar',
        titleIcon: 'done_all'
      }
    })

    dialogRef.afterClosed().pipe(
      take(1),
      switchMap((answer: { action: string, lastObservation: string }) =>
        iif(
          () => { return answer.action == "confirm" },
          this.dbs.deletePackage(pack),
          of(answer)
        )
      ))
      .subscribe((answer: { action: string, lastObservation: string } | firebase.firestore.WriteBatch) => {
        if ((<Object>answer).hasOwnProperty("action")) {
          //We don't do anything, as the action was cancelled,
        }
        else {
          (<firebase.firestore.WriteBatch>answer).commit().then(
            res => {
              this.snackBar.open('Paquete eliminado satisfactoriamente.', 'Aceptar');
            },
            err => {
              this.snackBar.open('Ocurrió un error. Vuelva a intentarlo.', 'Aceptar');
            }
          )
        }
      },
        err => {
          this.snackBar.open('Ocurrió un error. Vuelva a intentarlo.', 'Aceptar');
        })

  }

  onPromo(pack: Package) {
    let dialogRef: MatDialogRef<ProductEditPromoComponent>;
    dialogRef = this.dialog.open(ProductEditPromoComponent, {
      width: '350px',
      data: {
        data: { ...pack },
        pack: true
      }
    });
    dialogRef.afterClosed().subscribe(res => {
      switch (res) {
        case true:
          this.snackBar.open('El paquete fue editado satisfactoriamente', 'Aceptar', { duration: 5000 });
          break;
        case false:
          this.snackBar.open('Ocurrió un error. Por favor, vuelva a intentarlo', 'Aceptar', { duration: 5000 });
          break;
        default:
          break;
      }
    })
  }

  onCreateEditItem(edit: boolean, pack?: Package) {
    let dialogRef: MatDialogRef<PackagesCreateEditComponent>;
    if (edit == true) {
      dialogRef = this.dialog.open(PackagesCreateEditComponent, {
        data: {
          data: { ...pack },
          edit: edit
        }
      });
      dialogRef.afterClosed().subscribe(res => {
        switch (res) {
          case true:
            this.snackBar.open('El paquete fue editado satisfactoriamente', 'Aceptar', { duration: 5000 });
            break;
          case false:
            this.snackBar.open('Ocurrió un error. Por favor, vuelva a intentarlo', 'Aceptar', { duration: 5000 });
            break;
          default:
            break;
        }
      })
    }
    else {
      dialogRef = this.dialog.open(PackagesCreateEditComponent, {
        data: {
          data: null,
          edit: edit
        }
      });
      dialogRef.afterClosed().subscribe(res => {
        switch (res) {
          case true:
            this.snackBar.open('El paquete fue creado satisfactoriamente', 'Aceptar', { duration: 5000 });
            break;
          case false:
            this.snackBar.open('Ocurrió un error. Por favor, vuelva a intentarlo', 'Aceptar', { duration: 5000 });
            break;
          default:
            break;
        }
      })
    }
  }

  downloadXls(): void {
    let table_xlsx: any[] = [];
    let headersXlsx = [
      'Descripcion', 'SKU', 'Fecha Límite', 'Precio',
      'Descripción de Unidad', 'Abreviación',
      'Publicado', 'Items'
    ]

    table_xlsx.push(headersXlsx);

    this.packagesTableDataSource.filteredData.forEach(pack => {
      const temp = [
        pack.description,
        pack.sku,
        pack.dateLimit ? this.getXlsDate(pack.dateLimit) : "Indefinida",
        "S/." + pack.price.toFixed(2),
        pack.unit.description,
        pack.unit.abbreviation,
        pack.published ? "Sí" : "No",
        "-" + pack.items.map(el => el.productsOptions.map(opt => opt.description).join("; ")).join(" -")
      ];

      table_xlsx.push(temp);
    })

    /* generate worksheet */
    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(table_xlsx);

    /* generate workbook and add the worksheet */
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lista_de_paquetes');

    /* save to file */
    const name = 'Lista_de_paquetes' + '.xlsx';
    XLSX.writeFile(wb, name);
  }

  getXlsDate(date) {
    let dateObj = new Date(1970);
    dateObj.setSeconds(date['seconds'])
    return this.datePipe.transform(dateObj, 'dd/MM/yyyy');
  }
}