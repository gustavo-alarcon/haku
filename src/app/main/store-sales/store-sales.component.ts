import { Component, OnInit } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { AuthService } from 'src/app/core/services/auth.service';
import { DatabaseService } from 'src/app/core/services/database.service';
import { FormControl } from '@angular/forms';
import { shareReplay, startWith, switchMap, map, take } from 'rxjs/operators';
import { Sale, saleStatusOptions } from 'src/app/core/models/sale.model';
import { StoreSale } from 'src/app/core/models/storeSale.model';
import { MatTableDataSource } from '@angular/material/table';
import { Product } from 'src/app/core/models/product.model';
import { Ticket } from 'src/app/core/models/ticket.model';
import { AngularFirestore } from '@angular/fire/firestore';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-store-sales',
  templateUrl: './store-sales.component.html',
  styleUrls: ['./store-sales.component.scss']
})
export class StoreSalesComponent implements OnInit {

  loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();

  displayedColumns: string[] = ['product', 'price', 'quantity', 'total'];
  dataSource = new MatTableDataSource<{ product: Product, quantity: number }>();

  totalPrice = new BehaviorSubject<number>(0);
  totalPrice$ = this.totalPrice.asObservable();

  defaultImage = '../../../../assets/images/no-image.png'

  saleStatusOptions = new saleStatusOptions();

  saleStateSubject: BehaviorSubject<string> = new BehaviorSubject('Total');
  saleState$: Observable<string> = this.saleStateSubject.asObservable().pipe(shareReplay(1));

  date = new FormControl();
  statusForm = new FormControl();
  search = new FormControl();

  storeSales$: Observable<StoreSale[]>;
  filteredSales$: Observable<StoreSale[]>;
  status: string[] = [];
  search$: Observable<string>;

  actualTicket: StoreSale;

  locationSubject: BehaviorSubject<number> = new BehaviorSubject(0)
  locationPadding$: Observable<string>;

  failedItems: Array<boolean>;

  now = new Date();

  constructor(
    public auth: AuthService,
    private dbs: DatabaseService,
    private af: AngularFirestore,
    private snackbar: MatSnackBar
  ) { }

  ngOnInit(): void {
    this.dbs.changeTitle('Ventas tienda');

    this.initForms();

    this.storeSales$ = this.date.valueChanges.pipe(
      startWith(this.date.value),
      switchMap((date: { begin: Date, end: Date }) => {
        date.begin.setHours(0, 0, 0);
        date.end.setHours(23, 59, 59);
        return this.dbs.getStoreSales({ begin: date.begin, end: date.end })
      }),
      map(sales => {
        return sales
      })
    );

    this.filteredSales$ = combineLatest(
      this.storeSales$,
      this.search.valueChanges.pipe(startWith('')),
      this.statusForm.valueChanges.pipe(startWith('Todos'))
    ).pipe(
      map(([sales, search, status]) => {
        let filtered = sales.filter(el => {
          let searchTerm = search.toLocaleLowerCase();

          if (status === 'Todos') {
            return el.correlative?.toString().toLocaleLowerCase().includes(searchTerm) || el.createdBy.completeName.toLocaleLowerCase().includes(searchTerm)
          } else {
            return el.correlative?.toString().toLocaleLowerCase().includes(searchTerm) &&
              (el.status?.toString() === status)
          }
        });

        this.totalPrice.next(this.calcTotal(filtered));

        return filtered;
      })
    );

    this.locationPadding$ = this.locationSubject.asObservable().pipe(
      map(location => {
        // let aux = location + 1 > 10 ? (location % 10) : location;
        // console.log(aux);
        // let x = 160 + 50 * aux;
        let x = 22 + 142 * location;
        if (location > 0) {
          return x.toFixed(0) + "px"
        } else {
          return "22px"
        }
      })
    );

  }

  initForms() {
    this.date = new FormControl({
      begin: new Date(),
      end: new Date
    });

    this.status = Object.values(['Pagado', 'Anulado', 'Fallido'])

    this.statusForm = new FormControl('Todos')
    this.search = new FormControl('');
  }

  getCurrentMonthOfViewDate(): { from: Date, to: Date } {
    const date = new Date();
    const fromMonth = date.getMonth();
    const fromYear = date.getFullYear();

    const actualFromDate = new Date(fromYear, fromMonth, 1);

    const toMonth = (fromMonth + 1) % 12;
    let toYear = fromYear;

    if (fromMonth + 1 >= 12) {
      toYear++;
    }

    const toDate = new Date(toYear, toMonth, 1);

    return { from: actualFromDate, to: toDate };
  }

  showDetails(sale: StoreSale, index: number): void {
    this.actualTicket = sale;
    this.dataSource.data = sale.ticket.productList;
    this.locationSubject.next(index);
    this.failedItems = new Array(this.actualTicket.ticket.productList.length).fill(false);
    this.actualTicket.failedItems.forEach(el => {
      this.failedItems[el] = true;
    });
  }

  calcTotal(sales: Array<StoreSale>): number {
    let total = 0;

    sales.forEach(el => {
      if (el.status !== 'Anulado') {
        total = total + el.ticket.total;
      }
    });

    return total
  }

  downloadXls(sales: any): void {
    // 
  }

  retry(ticket: StoreSale): void {
    this.loading.next(true);

    let productListRef = this.af.firestore.collection('db/24multiservicios/productsList');

    let transactionsArray = [];

    ticket.failedItems.forEach(index => {
      let item = ticket.ticket.productList[index];
      console.log(item);
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
    })

    Promise.all(transactionsArray)
      .then(res => {
        let failedItems = [];
        let rightItems = [];
        console.log(res);
        res.forEach((el, index) => {
          if (!el) {
            failedItems.push(index);
          } else {
            rightItems.push(index);
          }
        });

        let saleDocRef = this.af.firestore.collection('/db/24multiservicios/storeSales').doc(ticket.id);

        let updateData = {
          status: failedItems.length > 0 ? 'Fallido' : 'Pagado',
          failedItems: failedItems,
          rightItems: rightItems
        }

        this.actualTicket.status = updateData.status;
        this.actualTicket.failedItems = updateData.failedItems;
        this.actualTicket.rightItems = updateData.rightItems;

        saleDocRef.update(updateData)
          .then(res => {
            if (failedItems.length === 0) {
              this.snackbar.open('Transacción exitosa, todos los productos fueron procesados!', 'Aceptar', {
                duration: 6000
              });
              this.loading.next(false);
            } else {
              this.snackbar.open('Parece que aún hay productos sin stock disponible!', 'Aceptar', {
                duration: 6000
              });
              this.loading.next(false);
            }
          })
          .catch(err => {
            console.log(err);
            this.snackbar.open('Hubo un error reintentando el ticket', 'Aceptar', {
              duration: 4000
            });
            this.loading.next(false);
          })
      })
  }

  cancel(ticket: StoreSale): void {
    this.loading.next(true);

    let productListRef = this.af.firestore.collection('db/24multiservicios/productsList');

    let transactionsArray = [];

    ticket.rightItems.forEach(index => {
      let item = ticket.ticket.productList[index];
      transactionsArray.push(
        this.af.firestore.runTransaction(t => {
          return t.get(productListRef.doc(item.product.id))
            .then(doc => {
              if (doc.exists) {
                let newStock = doc.data().realStock + item.quantity;

                if (doc.data().calcStock !== '1') {
                  return true
                } else {
                  t.update(productListRef.doc(item.product.id), { realStock: newStock });
                  return true;
                }
              }

            })
            .catch(err => {
              console.log(err);
              return false;
            })
        })
      )
    })

    Promise.all(transactionsArray)
      .then(res => {

        let saleDocRef = this.af.firestore.collection('/db/24multiservicios/storeSales').doc(ticket.id);

        let updateData = {
          status: 'Anulado',
        }

        this.actualTicket.status = updateData.status;

        saleDocRef.update(updateData)
          .then(res => {
            this.snackbar.open('Transacción exitosa, ticket anulado!', 'Aceptar', {
              duration: 6000
            });
            this.loading.next(false);
          })
          .catch(err => {
            console.log(err);
            this.snackbar.open('Hubo un error anulando el ticket', 'Aceptar', {
              duration: 4000
            });
            this.loading.next(false);
          })
      })
  }
}
