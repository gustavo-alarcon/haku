import { Component, OnInit, Input } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { Sale, saleStatusOptions, SaleRequestedProducts } from 'src/app/core/models/sale.model';
import { shareReplay, startWith, switchMap, map } from 'rxjs/operators';
import { FormControl } from '@angular/forms';
import { DatabaseService } from 'src/app/core/services/database.service';
import { MatDialog } from '@angular/material/dialog';
import * as XLSX from 'xlsx';
import { DatePipe } from '@angular/common';
import { SalesAddressDialogComponent } from '../sales-address-dialog/sales-address-dialog.component';


@Component({
  selector: 'app-sales-master',
  templateUrl: './sales-master.component.html',
  styleUrls: ['./sales-master.component.scss']
})
export class SalesMasterComponent implements OnInit {
  @Input() detailSubject: BehaviorSubject<Sale>;
  @Input() locationSubject: BehaviorSubject<Number>;
  @Input() totalPriceSubject: BehaviorSubject<number>;

  defaultImage = '../../../../assets/images/no-image.png'

  saleStatusOptions = new saleStatusOptions();

  p: number = 1;

  saleStateSubject: BehaviorSubject<string> = new BehaviorSubject('Total');
  saleState$: Observable<string> = this.saleStateSubject.asObservable().pipe(shareReplay(1));
  salesFiltered$: Observable<Sale[]>;

  date: FormControl;
  statusForm: FormControl;
  search: FormControl;

  sales$: Observable<Sale[]>;
  status: string[] = [];
  search$: Observable<string>;

  constructor(
    private dbs: DatabaseService,
    private dialog: MatDialog,
    public datePipe: DatePipe

  ) { }


  ngOnInit() {
    this.initForms();
    this.initObservables();
  }

  initForms() {
    this.date = new FormControl({
      begin: this.getCurrentMonthOfViewDate().from,
      end: this.getCurrentMonthOfViewDate().to
    });

    this.status = Object.values(new saleStatusOptions())

    this.statusForm = new FormControl('Todos')
    this.search = new FormControl('');
  }

  initObservables() {
    this.sales$ = this.date.valueChanges.pipe(
      startWith(this.date.value),
      switchMap((date: { begin: Date, end: Date }) => {
        let endDate = date.end;
        endDate.setHours(23, 59, 59);
        return this.dbs.getSales({ begin: date.begin, end: endDate })
      }),
      map(sales => {
        return sales
      })
    );

    this.search$ = this.search.valueChanges;


    this.salesFiltered$ = combineLatest(
      this.search$.pipe(startWith('')),
      this.sales$,
      this.statusForm.valueChanges.pipe(startWith('Todos')))
      .pipe(
        map(([search, sales, saleState]) => {
          let order = sales.sort((a, b) => Number(b.correlative) - Number(a.correlative))
          if (saleState == 'Todos') {
            if (this.totalPriceSubject) {
              this.totalPriceSubject.next(this.giveTotalSalesPrice(order.filter(el => el.status !== 'Anulado')))
            }

            return order.filter(el => {
              return el.correlative.toString().includes(search) ||
                el.user.email?.includes(search.toLowerCase()) ||
                el.user.name?.toLowerCase().includes(search.toLowerCase()) ||
                el.user.lastName1?.toLowerCase().includes(search.toLowerCase()) ||
                el.user.lastName2?.toLowerCase().includes(search.toLowerCase()) ||
                el.user.displayName?.toLowerCase().includes(search.toLowerCase()) ||
                el.user.dni?.toString().toLowerCase().includes(search.toLowerCase())
            });

          } else {
            if (this.totalPriceSubject) {
              this.totalPriceSubject.next(this.giveTotalSalesPrice(order.filter(el => el.status == saleState)))
            }
            return order.filter(el => {
              return el.status == saleState && (
                el.correlative.toString().includes(search) ||
                el.user.email?.includes(search.toLowerCase()) ||
                el.user.name?.toLowerCase().includes(search.toLowerCase()) ||
                el.user.lastName1?.toLowerCase().includes(search.toLowerCase()) ||
                el.user.lastName2?.toLowerCase().includes(search.toLowerCase()) ||
                el.user.displayName?.toLowerCase().includes(search.toLowerCase()) ||
                el.user.dni?.toString().toLowerCase().includes(search.toLowerCase())
              )
            }
            );
          }
        }),
        shareReplay(1)
      )
  }



  onSelectDetail(data: Sale, salesFiltered: Sale[]) {
    this.detailSubject.next(undefined);
    let index = salesFiltered.findIndex(el => el.id == data.id);
    setTimeout(() => {
      this.locationSubject.next(index);
      this.detailSubject.next(data);
    }, 4);
  }

  onCheckDirection(el: Sale, event) {
    event.stopPropagation()
    this.dialog.open(SalesAddressDialogComponent, {
      data: el,
      width: '90vw',
      maxWidth: '700px'
    })
  }

  getName(displayName: string): string {
    let name = displayName.split(" ");
    switch (name.length) {
      case 1:
      case 2:
        return displayName;
      default:
        return name[0] + " " + name[2];
    }
  }

  // getTotalPrice(sales: Sale[]): number {
  //   if (sales) {
  //     return sales.reduce((acc, curr) => {
  //         return curr.deliveryPrice + curr.total + acc
  //       }, 0)
  //   }
  //   else {
  //     return 0;
  //   }
  // }

  downloadXls(sales: Sale[]): void {
    //console.log(sales);
    let table_xlsx: any[] = [];
    let headersXlsx = [
      'Correlativo',
      'Usuario',
      'DNI',
      'e-mail',
      'Teléfono',
      'Estado',
      'Dirección',
      'Distrito',
      'Referencia',
      // 'Sub-Total', 
      // 'Delivery', 
      'Total',
      'OP',
      'Tipo de pago',
      'Fecha de Solicitud',
      //'Fecha de Envio Deseada', 
      'Usuario Responsable',
      'Fecha de Atención',
      'Usuario de Confirmación de Solicitud',
      'Fecha de Confirmación de Solicitud',
      'Fecha Asignada',
      'Usuario de Confirmación de Comprobante',
      'Fecha de Confirmación de Comprobante',
      //'Fecha de Confirmación de Delivery', 
      //'Fecha de Asignación de Conductor', 
      //'Fecha de Entrega',
      'Usuario de Anulación',
      'Fecha de Anulación',
      'Sub Total', 'IGV', 'Total', 'Delivery', 'Total con Delivery',
      'Paquete', 'Descripción', 'Cantidad', 'Peso Unitario', 'Peso Total', 'Precio Total']

    table_xlsx.push(headersXlsx);

    sales.forEach(sale => {
      const temp = [
        sale.correlative.toString().padStart(6, "0"),
        sale.user.name ? sale.user.lastName1 ? sale.user.lastName2 ?
          sale.user.name + " " + sale.user.lastName1 + " " + sale.user.lastName2 :
          sale.user.name + " " + sale.user.lastName1 : sale.user.name :
          (sale.user.displayName ? sale.user.displayName : "Sin nombre"),
        sale.user.dni ? sale.user.dni : "Sin DNI",
        sale.user.email,
        sale.location.address ? sale.location.phone : '',
        sale.status,
        sale.location.address ? sale.location.address : '',
        sale.location.address ? sale.location.district['name'] : '',
        sale.location.address ? sale.location.reference : '',
        (this.giveTotalPrice(sale) + sale.deliveryPrice).toFixed(2),
        '',
        typeof sale.payType == 'string' ? sale.payType : sale.payType.name,
        sale.createdAt ? this.getXlsDate(sale.createdAt) : "-",
        //sale.requestDate ? this.getXlsDate(sale.requestDate) : "-",
        sale.attendedData ?
          sale.attendedData.attendedBy.name ? sale.attendedData.attendedBy.lastName1 ? sale.attendedData.attendedBy.lastName2 ?
            sale.attendedData.attendedBy.name + " " + sale.attendedData.attendedBy.lastName1 + " " + sale.attendedData.attendedBy.lastName2 :
            sale.attendedData.attendedBy.name + " " + sale.attendedData.attendedBy.lastName1 : sale.attendedData.attendedBy.name :
            (sale.attendedData.attendedBy.displayName ? sale.attendedData.attendedBy.displayName : "Sin nombre") : "-",
        sale.attendedData ? this.getXlsDate(sale.attendedData.attendedAt) : "-",
        sale.confirmedRequestData ?
          sale.confirmedRequestData.confirmedBy.name ? sale.confirmedRequestData.confirmedBy.lastName1 ? sale.confirmedRequestData.confirmedBy.lastName2 ?
            sale.confirmedRequestData.confirmedBy.name + " " + sale.confirmedRequestData.confirmedBy.lastName1 + " " + sale.confirmedRequestData.confirmedBy.lastName2 :
            sale.confirmedRequestData.confirmedBy.name + " " + sale.confirmedRequestData.confirmedBy.lastName1 : sale.confirmedRequestData.confirmedBy.name :
            (sale.confirmedRequestData.confirmedBy.displayName ? sale.confirmedRequestData.confirmedBy.displayName : "Sin nombre") : "-",
        sale.confirmedRequestData ? this.getXlsDate(sale.confirmedRequestData.confirmedAt) : "-",
        sale.confirmedRequestData ? this.getXlsDate(sale.confirmedRequestData.assignedDate) : "-",
        sale.confirmedDocumentData ?
          sale.confirmedDocumentData.confirmedBy.name ? sale.confirmedDocumentData.confirmedBy.lastName1 ? sale.confirmedDocumentData.confirmedBy.lastName2 ?
            sale.confirmedDocumentData.confirmedBy.name + " " + sale.confirmedDocumentData.confirmedBy.lastName1 + " " + sale.confirmedDocumentData.confirmedBy.lastName2 :
            sale.confirmedDocumentData.confirmedBy.name + " " + sale.confirmedDocumentData.confirmedBy.lastName1 : sale.confirmedDocumentData.confirmedBy.name :
            (sale.confirmedDocumentData.confirmedBy.displayName ? sale.confirmedDocumentData.confirmedBy.displayName : "Sin nombre") : "-",
        sale.confirmedDocumentData ? this.getXlsDate(sale.confirmedDocumentData.confirmedAt) : "-",
        //sale.confirmedDeliveryData ? this.getXlsDate(sale.confirmedDeliveryData.confirmedAt) : "-",
        //sale.driverAssignedData ? this.getXlsDate(sale.driverAssignedData.assignedAt) : "-",
        //sale.finishedData ? this.getXlsDate(sale.finishedData.finishedAt) : "-",
        sale.cancelledData ?
          sale.cancelledData.cancelledBy.name ? sale.cancelledData.cancelledBy.lastName1 ? sale.cancelledData.cancelledBy.lastName2 ?
            sale.cancelledData.cancelledBy.name + " " + sale.cancelledData.cancelledBy.lastName1 + " " + sale.cancelledData.cancelledBy.lastName2 :
            sale.cancelledData.cancelledBy.name + " " + sale.cancelledData.cancelledBy.lastName1 : sale.cancelledData.cancelledBy.name :
            (sale.cancelledData.cancelledBy.displayName ? sale.cancelledData.cancelledBy.displayName : "Sin nombre") : "-",
        sale.cancelledData ? this.getXlsDate(sale.cancelledData.cancelledAt) : "-",
        (this.giveTotalPrice(sale) - this.giveTotalPrice(sale) / 1.18 * 0.18).toFixed(2), //Soles
        (this.giveTotalPrice(sale) / 1.18 * 0.18).toFixed(2),
        (this.giveTotalPrice(sale)).toFixed(2),
        (sale.deliveryPrice).toFixed(2),
        (this.giveTotalPrice(sale) + sale.deliveryPrice).toFixed(2),
      ];
      //      'Producto', 'Cantidad', 'Precio'

      sale.requestedProducts.forEach(prod => {       
        // console.log(prod);

        // let temp2 = [
        //   ...temp,
        //   !prod.product.package ? prod.product.description : prod.product.description+"("+
        //     prod.chosenOptions.map(el => el ? el.description : "Sin elegir").join("; ")
        //   +")",
        //   prod.quantity,
        //   prod.product.unit.weight,
        //   (prod.quantity*prod.product.unit.weight),
        //   "S/. "+this.givePrice(prod).toFixed(2)
        // ]
        // table_xlsx.push(temp2);
        let temp2;

        if (!prod.product.package) {
          temp2 = [
            ...temp,
            '-',
            prod.product.description,
            prod.quantity,
            prod.product.unit.weight,
            (prod.quantity * prod.product.unit.weight),
            this.givePrice(prod).toFixed(2) //Soles
          ]
          table_xlsx.push(temp2);
        } else {
          prod.chosenOptions.map(el => {
            if (el) {
              temp2 = [
                ...temp,
                prod.product.description,
                el.description,
                prod.quantity,
                el.unit.weight,
                (prod.quantity * el.unit.weight),
                this.givePrice(prod).toFixed(2)
              ]
              table_xlsx.push(temp2);
            }
          })
        }
      })
    })

    /* generate worksheet */
    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(table_xlsx);

    /* generate workbook and add the worksheet */
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relacion_de_Ventas');

    /* save to file */
    const name = 'Relacion_de_Ventas' + '.xlsx';
    XLSX.writeFile(wb, name);
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

  getCorrelative(corr: number) {
    return corr.toString().padStart(4, '0')
  }

  getUser(userId): Observable<string> {
    //console.log("now")
    return this.dbs.getUserDisplayName(userId)
  }

  getXlsDate(date) {
    let dateObj = new Date(1970);
    dateObj.setSeconds(date['seconds'])
    return this.datePipe.transform(dateObj, 'dd/MM/yyyy');
  }

  givePrice(item: SaleRequestedProducts): number {
    let amount = item['quantity']
    let price = item['product']['price']
    if (item.product.promo) {
      let promo = item['product']['promoData']['quantity']
      let pricePromo = item['product']['promoData']['promoPrice']

      if (amount >= promo) {
        let wp = amount % promo
        let op = Math.floor(amount / promo)
        return wp * price + op * pricePromo
      } else {
        return amount * price
      }
    } else {
      return amount * price
    }
  }
  giveTotalPrice(sale: Sale): number {
    return sale.requestedProducts.reduce((a, b) => a + this.givePrice(b), 0)
  }

  giveTotalSalesPrice(sales: Sale[]): number {
    return sales.reduce((a, b) => a + (this.giveTotalPrice(b) + b.deliveryPrice), 0)
  }
}


