import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { FormBuilder, FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { throws } from 'assert';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { startWith, map, tap, distinctUntilChanged, debounceTime } from 'rxjs/operators';
import { Category } from 'src/app/core/models/category.model';
import { Product } from 'src/app/core/models/product.model';
import { AuthService } from 'src/app/core/services/auth.service';
import { DatabaseService } from 'src/app/core/services/database.service';

@Component({
  selector: 'app-product-entry',
  templateUrl: './product-entry.component.html',
  styleUrls: ['./product-entry.component.scss']
})
export class ProductEntryComponent implements OnInit {

  itemsFilterForm: FormControl;
  quantity = new FormControl();

  //Observables
  categoryObservable$: Observable<[any, Category[]]>
  categoryList$: Observable<Category[]>
  filteredProduct$: Observable<Product[]>


  //Variables
  defaultImage = "../../../assets/images/24multi-vertical-logo.png";

  //noResult
  noResult$: Observable<string>;
  noResultImage: string = '';

  categorySelected: boolean = false;

  productsObservable$: Observable<Product[]>;

  loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();



  constructor(
    private fb: FormBuilder,
    private dialog: MatDialog,
    public snackBar: MatSnackBar,
    private dbs: DatabaseService,
    public auth: AuthService,
    private af: AngularFirestore
  ) { }

  ngOnInit(): void {
    this.initForms();
    this.initObservables();
  }

  initForms() {
    this.itemsFilterForm = this.fb.control("");
  }

  initObservables() {
    this.productsObservable$ = this.dbs.getProductsListValueChanges();

    this.filteredProduct$ = combineLatest(
      this.productsObservable$,
      this.itemsFilterForm.valueChanges.pipe(startWith(''), distinctUntilChanged(), debounceTime(300))
    ).pipe(
      map(([productList, filter]) => {
        let term = filter.sku ? filter.sku : filter;
        if (term === '') {
          return [];
        }
        let filtered = productList.filter(el => el.description.includes(term) || (el.sku === term))

        if (filtered.length) {
          return filtered
        } else {
          this.snackBar.open("producto NO REGISTRADO", "Aceptar", {
            duration: 4000
          });
          return []
        }
      })
    )
  }

  showOption(product: Product): string | null {
    return product.sku ? product.sku : null;
  }

  save(): void {
    this.loading.next(true);

    if (this.quantity && this.itemsFilterForm) {

      this.auth.user$.subscribe(user => {

        this.af.firestore.runTransaction(t => {

          console.log(this.itemsFilterForm.value.id);

          let prodRef = this.af.firestore.collection('/db/24multiservicios/productsList').doc(this.itemsFilterForm.value.id);
          let entriesRef = this.af.firestore.collection('/db/24multiservicios/productsEntries');
          let entryRef = entriesRef.doc();

          return t.get(prodRef)
            .then(doc => {
              if (doc.exists) {
                let newStock = doc.data().realStock + this.quantity.value;

                t.update(prodRef, { realStock: newStock });

                let newEntry = {
                  id: entryRef.id,
                  product: this.itemsFilterForm.value,
                  quantity: this.quantity.value,
                  createdAt: new Date(),
                  createdBy: user
                }

                t.set(entryRef, newEntry);
              } else {
                console.log(doc);
                throw new Error("El documento no existe");
              }
            })
        }).then(() => {
          this.snackBar.open("Stock actualizado", "Aceptar", {
            duration: 3000
          });
          this.itemsFilterForm.setValue(this.itemsFilterForm.value);
          this.quantity.setValue(null);
          this.loading.next(false);
        }).catch(err => {
          console.log(err);
          this.snackBar.open("hubo un error actualizando el stock, intentelo de nuevo", "Aceptar", {
            duration: 6000
          });
          this.loading.next(false);
        })
      })

    }
  }

}
