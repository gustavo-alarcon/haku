import { Component, OnInit, Input } from '@angular/core';
import { FormGroup, FormBuilder, FormArray, Validators, FormControl } from '@angular/forms';
import { Observable, BehaviorSubject, merge, combineLatest, iif, of, throwError, empty } from 'rxjs';
import { Sale, SaleRequestedProducts, saleStatusOptions } from 'src/app/core/models/sale.model';
import { DatabaseService } from 'src/app/core/services/database.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { startWith, map, tap, take, switchMap, debounceTime, pairwise, filter } from 'rxjs/operators';
import { Product } from 'src/app/core/models/product.model';
import { AuthService } from 'src/app/core/services/auth.service';
import { User } from 'src/app/core/models/user.model';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from '../../confirmation-dialog/confirmation-dialog.component';
import { SalesPhotoDialogComponent } from '../sales-photo-dialog/sales-photo-dialog.component';
import { GeneralConfig } from 'src/app/core/models/generalConfig.model';
import { Package, PackageItems } from 'src/app/core/models/package.model';

@Component({
  selector: 'app-sales-detail',
  templateUrl: './sales-detail.component.html',
  styleUrls: ['./sales-detail.component.scss']
})
export class SalesDetailComponent implements OnInit {
  now: Date = new Date();

  loading$: BehaviorSubject<boolean> = new BehaviorSubject(false)

  productForm: FormGroup;
  confirmedRequestForm: FormGroup;
  confirmedDocumentForm: FormGroup;
  confirmedDeliveryForm: FormGroup;
  voucherCheckedForm: FormControl;

  searchProductControl: FormControl;

  products$: Observable<(Product | Package)[]>
  weight$: Observable<any>;

  @Input() sale: Sale
  @Input() detailSubject: BehaviorSubject<Sale>

  saleStatusOptions = new saleStatusOptions();

  constructor(
    private fb: FormBuilder,
    private dbs: DatabaseService,
    private snackBar: MatSnackBar,
    public auth: AuthService,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    console.log(this.sale)
    this.initForm()
    this.initObservables()
  }

  debug(sth: any){
    console.log(sth)
  }

  initForm() {
    this.searchProductControl = new FormControl("")

    this.productForm = this.fb.group({
      deliveryPrice: [this.sale.deliveryPrice, Validators.required],
      productList: this.fb.array([])
    });

    this.voucherCheckedForm = new FormControl(!!this.sale.voucherChecked, Validators.requiredTrue);

    this.sale.requestedProducts.forEach((product, index) => {
      (<FormArray>this.productForm.get('productList')).insert(index,
        product.product.package ?
          this.fb.group({
            product: [product.product, Validators.required], //Product|Package
            quantity: [product.quantity, Validators.required],
            chosenOptions: this.fb.array(
              product.chosenOptions.map(productId => new FormControl(productId))
            )
          }) :
          this.fb.group({
            product: [product.product, Validators.required],
            quantity: [product.quantity, Validators.required],
          })
      )
      console.log(this.productForm.get('productList').value)
    })

    this.confirmedRequestForm = this.fb.group({
      // desiredDate: [this.getDateFromDB(this.sale.requestDate)],
      assignedDate: [
        !this.sale.confirmedRequestData ? null :
          this.getDateFromDB(this.sale.confirmedRequestData.assignedDate),
        Validators.required],
      observation: [
        !this.sale.confirmedRequestData ? null :
          this.sale.confirmedRequestData.observation],
    })

    this.confirmedDocumentForm = this.fb.group({
      document: [this.sale.document],
      documentNumber: [
        !this.sale.confirmedDocumentData ? null :
          this.sale.confirmedDocumentData.documentNumber,
        Validators.required
      ]
    })

    this.confirmedDeliveryForm = this.fb.group({
      deliveryType: [
        !this.sale.confirmedDeliveryData ? false :
          this.sale.confirmedDeliveryData.deliveryType == "Biker" ?
            false : true
      ],
      deliveryBusiness: [
        !this.sale.confirmedDeliveryData ? null :
          this.sale.confirmedDeliveryData.deliveryBusiness
      ],
    })
  }

  getProductOptionFromId(productOptions: PackageItems["productsOptions"], id: string): PackageItems["productsOptions"][0]{
    return productOptions.find(el => el.id == id)
  }

  //initRequestConfirmed

  getDateFromDB(date: Date) {
    let parsedDate = new Date(1970);
    parsedDate.setSeconds(date['seconds'])
    return parsedDate
  }

  initObservables() {
    //Search Product
    this.products$ = combineLatest(
      this.searchProductControl.valueChanges.pipe(startWith("")),
      combineLatest(this.dbs.getProductsListValueChanges(), this.dbs.getPackagesListValueChanges()
      ).pipe(map(([prod, pack]) => [...prod, ...pack].sort((a, b) =>
        a.description > b.description ? 1 : a.description < b.description ? -1 : 0))
      ),
      this.dbs.getGeneralConfigDoc()).pipe(
        map(([formValue, productsList, generalConfig]) => {

          //console.log(formValue);

          let products = !productsList.length ? [] :
            productsList.filter(el => !this.productForm.get('productList').value.find(
              (product: SaleRequestedProducts) => product.product.id == el.id
            ))

          if (typeof formValue === 'string') {
            return products.filter(el => el.description.match(new RegExp(formValue, 'ig')))
          } else {

            let product: SaleRequestedProducts = {
              product: (<Product | Package>formValue),
              quantity: 1,
              chosenOptions: !(<Product | Package>formValue).package ? null :
                new Array((<Package>formValue).totalItems)
            };

            if (this.getTotalWeight() + this.giveProductWeight(product) > generalConfig.maxWeight) {
              this.snackBar.open("Lo sentimos, exceso de peso.", "Aceptar")
              this.searchProductControl.setValue("")
              return productsList
            } else {

              (<FormArray>this.productForm.get('productList')).insert(0,
                product.product.package ?
                  this.fb.group({
                    product: [product.product, Validators.required],
                    quantity: [product.quantity, Validators.required],
                    chosenOptions: this.fb.array(
                      product.product.items.map(item =>
                        item.productsOptions.length != 1 ? new FormControl()
                          : new FormControl(item.productsOptions[0])
                      )
                    )
                  }) :
                  this.fb.group({
                    product: [product.product, Validators.required],
                    quantity: [product.quantity, Validators.required],
                  })
              )

              this.searchProductControl.setValue("")
              return productsList.filter(el => !this.productForm.get('productList').value.find(
                (product: SaleRequestedProducts) => product.product.id == el.id
              ))
            }
          }
        })
      )


    this.weight$ = combineLatest(
      (<Observable<[SaleRequestedProducts[], SaleRequestedProducts[]]>>(<FormArray>this.productForm.get('productList')).valueChanges
        .pipe(startWith(this.productForm.get('productList').value), pairwise())),
      this.dbs.getGeneralConfigDoc()
    ).pipe(
      filter(([[prev, curr], config]) => this.getTotalWeight() > config.maxWeight ? true : false),
      map(([[prev, curr], config]) => {

        let changedItemIndex = curr.findIndex(currEl => {
          if (prev.find(prevEl => prevEl.product.id == currEl.product.id)) {
            return (this.giveProductWeight(currEl) !=
              this.giveProductWeight(prev.find(prevEl => prevEl.product.id == currEl.product.id)))
          } else {
            return false
          }
        });

        console.log('again?');

        let foundPreviousItem = prev.find((prevEl) => curr[changedItemIndex].product.id == prevEl.product.id);

        if (!foundPreviousItem.product.package) {
          this.snackBar.open("No puede aumentar la cantidad. Exceso de peso.", "Aceptar");
          (<FormArray>this.productForm.get('productList'))
            .controls[changedItemIndex].get('quantity').setValue(foundPreviousItem.quantity);
        } else {
          console.log(foundPreviousItem.chosenOptions)
          console.log(curr[changedItemIndex].chosenOptions);
          if (curr[changedItemIndex].chosenOptions == foundPreviousItem.chosenOptions) {
            this.snackBar.open("No puede aumentar la cantidad. Exceso de peso.", "Aceptar");
            (<FormArray>this.productForm.get('productList'))
              .controls[changedItemIndex].get('quantity').setValue(foundPreviousItem.quantity);
          }
          else {
            this.snackBar.open("No puede seleccionar producto. Exceso de peso.", "Aceptar");
            (<FormArray>(<FormArray>this.productForm.get('productList'))
              .controls[changedItemIndex].get('chosenOptions')).setValue(foundPreviousItem.chosenOptions);
          }

        }

      })
    )
  }

  onDeleteProduct(index: number) {
    (<FormArray>this.productForm.get('productList')).removeAt(index);
  }

  confirmVoucherChecked(event: MouseEvent, user: User) {
    event.preventDefault();
    this.loading$.next(true)
    let dialogRef: MatDialogRef<ConfirmationDialogComponent>;

    if (this.voucherCheckedForm.value) {
      dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        closeOnNavigation: false,
        disableClose: true,
        width: '360px',
        maxWidth: '360px',
        data: {
          warning: `Cancelar Voucher.`,
          content: `¿Está seguro de deshacer la validación del Voucher?`,
          noObservation: true,
          observation: null,
          title: 'Deshacer',
          titleIcon: 'warning'
        }
      })
    } else {
      dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        closeOnNavigation: false,
        disableClose: true,
        width: '360px',
        maxWidth: '360px',
        data: {
          warning: `Confirmar Voucher.`,
          content: `¿Está seguro de confirmar la validación del Voucher?`,
          noObservation: true,
          observation: null,
          title: 'Confirmar',
          titleIcon: 'warning'
        }
      })
    }

    dialogRef.afterClosed().pipe(
      take(1),
      switchMap((answer: { action: string, lastObservation: string }) => iif(
        //condition
        () => { return answer.action == "confirm" },
        //confirmed
        of(this.dbs.onUpdateSaleVoucher(this.sale.id, !this.voucherCheckedForm.value, user)).pipe(
          switchMap(
            batch => {

              return batch.commit().then(
                res => {
                  this.voucherCheckedForm.setValue(!this.voucherCheckedForm.value);
                  this.snackBar.open('El pedido fue editado satisfactoriamente', 'Aceptar');
                },
                err => {
                  throwError(err)
                }
              )
            }
          )
        ),
        empty()
      ))).subscribe(
        () => {
          this.loading$.next(false)
        },
        err => {
          this.loading$.next(false)
          console.log(err);
          this.snackBar.open('Ocurrió un error. Vuelva a intentarlo.', 'Aceptar');
        },
        () => {
          this.loading$.next(false)
        }
      )
  }

  checkVouchers(user: User) {
    let dialogRef: MatDialogRef<SalesPhotoDialogComponent>
    dialogRef = this.dialog.open(SalesPhotoDialogComponent, {
      width: '350px',
      data: {
        data: this.sale,
        user: user
      }
    });

    dialogRef.afterClosed().pipe(
      take(1)).subscribe(
        (newSale: Sale) => {
          if (newSale) {
            this.detailSubject.next(newSale);
          }
        }
      )
  }

  //newStatus will work as an old status when we edit (deshacer)
  //edit=true for deschacer
  onSubmitForm(newStatus: Sale['status'], user: User, edit?: boolean) {
    this.loading$.next(true);
    let downNewStatus = edit ? this.onEditSaleGetNewStatus(newStatus, user) : null;
    let sale = edit ? this.onGetUpdatedSale(downNewStatus, user) : this.onGetUpdatedSale(newStatus, user);

    of(!!edit).pipe(
      switchMap(edit => {
        if (!edit) {
          return this.upgradeConfirmation(newStatus)
        } else {
          return this.downgradeConfirmation(downNewStatus)
        }
      }),
      switchMap(answer => iif(
        //condition
        () => { return answer.action == "confirm" },
        //confirmed
        this.dbs.onSaveSale(sale).pipe(
          switchMap(
            batch => {
              //If we are editting it (deshacer), and we are returning from
              //confirmedDocument to confirmedRequest, we should refill the 
              //lost stock
              if (newStatus == this.saleStatusOptions.cancelled) {
                this.onUpdateStock(this.getSaleRequestedProducts(), batch, false)
              }
              // //If we are editting it (deshacer), and we are returning from
              // //confirmedDelivery to confirmedDocument, we should refill the 
              // //lost stock
              // if(edit){
              //   if(downNewStatus == this.saleStatusOptions.confirmedDocument &&
              //       newStatus != this.saleStatusOptions.cancelled){
              //     this.onUpdateStock(this.getSaleRequestedProducts(), batch, false)
              //   } else {
              //     //If we are returning fron cancelled to any of the ones bellow,
              //     //We should take out from stock
              //     if( newStatus == this.saleStatusOptions.cancelled &&
              //       ( downNewStatus == this.saleStatusOptions.confirmedDelivery ||
              //         downNewStatus == this.saleStatusOptions.driverAssigned ||
              //         downNewStatus == this.saleStatusOptions.finished)
              //       ){
              //         //Recall that when we edit (deshacer) newStatus will work as the past status
              //         this.onUpdateStock(this.getSaleRequestedProducts(), batch, true)
              //       }
              //   }
              // } else {
              //   //WE are note editting, but we are confirming delivery, so we
              //   //should take out stock
              //   if(newStatus == this.saleStatusOptions.confirmedDelivery){
              //     this.onUpdateStock(this.getSaleRequestedProducts(), batch, true)
              //   } else {
              //     if(newStatus == this.saleStatusOptions.cancelled){
              //       this.onUpdateStock(this.getSaleRequestedProducts(), batch, false)
              //     }
              //   }
              // }
              return batch.commit().then(
                res => {
                  this.snackBar.open('El pedido fue editado satisfactoriamente', 'Aceptar');
                  this.detailSubject.next(sale);
                },
                err => {
                  throwError(err)
                }
              )
            }
          )
        ),
        //dismissed
        empty()
      )
      )
    ).subscribe(
      () => {
        this.loading$.next(false)
      },
      err => {
        console.log(err);
        this.snackBar.open('Ocurrió un error. Vuelva a intentarlo.', 'Aceptar');
        this.loading$.next(false);
      },
      () => {
        this.loading$.next(false)
      }
    )
  }

  onEditSaleGetNewStatus(pastStatus: Sale['status'], user: User): Sale['status'] {
    switch (pastStatus) {
      case this.saleStatusOptions.attended:
        return this.saleStatusOptions.requested
      case this.saleStatusOptions.confirmedRequest:
        return this.saleStatusOptions.attended
      case this.saleStatusOptions.confirmedDocument:
        return this.saleStatusOptions.confirmedRequest
      // case this.saleStatusOptions.confirmedDelivery:
      //   //we should refill stock here
      //     return  this.saleStatusOptions.confirmedDocument
      // //If it is in finished or driverAssigned state,
      // //we return it to confirmedDelivery
      // case this.saleStatusOptions.driverAssigned:
      //     return  this.saleStatusOptions.confirmedDocument
      case this.saleStatusOptions.finished:
        return this.saleStatusOptions.confirmedDocument
      case this.saleStatusOptions.cancelled:
        //We don't include a finished data, 
        //because a finished sale can not be cancelled
        if (this.sale.finishedData) {
          // return this.saleStatusOptions.finished
        } else {
          if (this.sale.driverAssignedData) {
            // return  this.saleStatusOptions.driverAssigned
          } else {
            if (this.sale.confirmedDeliveryData) {
              // return  this.saleStatusOptions.confirmedDelivery
            } else {
              if (this.sale.confirmedDocumentData) {
                return this.saleStatusOptions.confirmedDocument
              } else {
                if (this.sale.confirmedRequestData) {
                  return this.saleStatusOptions.confirmedRequest
                } else {
                  if (this.sale.attendedData) {
                    return this.saleStatusOptions.attended
                  } else {
                    return this.saleStatusOptions.requested
                  }
                }
              }
            }
          }
        }

    }
  }

  downgradeConfirmation(newStatus: Sale['status']):
    Observable<{ action: string, lastObservation: string }> {
    let dialogRef: MatDialogRef<ConfirmationDialogComponent>;

    if (newStatus == this.saleStatusOptions.confirmedRequest) {
      dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        closeOnNavigation: false,
        disableClose: true,
        width: '360px',
        maxWidth: '360px',
        data: {
          warning: `La solicitud será editada.`,
          content: `¿Está seguro de regresar la solicitud al estado <b>'${newStatus}'</b>?
          Con esta acción, se reestablecerá el stock correspondiente.`,
          noObservation: true,
          observation: null,
          title: 'Deshacer',
          titleIcon: 'warning'
        }
      })
    } else {
      dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        closeOnNavigation: false,
        disableClose: true,
        width: '360px',
        maxWidth: '360px',
        data: {
          warning: `La solicitud será editada.`,
          content: `¿Está seguro de regresar la solicitud al estado <b>'${newStatus}'</b>?`,
          noObservation: true,
          observation: null,
          title: 'Deshacer',
          titleIcon: 'warning'
        }
      })
    }

    return dialogRef.afterClosed().pipe(take(1))
  }

  upgradeConfirmation(newStatus: Sale['status']):
    Observable<{ action: string, lastObservation: string }> {
    let dialogRef: MatDialogRef<ConfirmationDialogComponent>;

    if (newStatus == this.saleStatusOptions.confirmedDocument) {
      dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        closeOnNavigation: false,
        disableClose: true,
        width: '360px',
        maxWidth: '360px',
        data: {
          warning: `La solicitud será actualizada.`,
          content: `¿Está seguro de actualizar la solicitud al estado <b>'${newStatus}'</b>?
          Con esta acción, se descontará el stock correspondiente.`,
          noObservation: true,
          observation: null,
          title: 'Actualizar',
          titleIcon: 'warning'
        }
      })
    } else {
      if (newStatus == this.saleStatusOptions.cancelled) {
        dialogRef = this.dialog.open(ConfirmationDialogComponent, {
          closeOnNavigation: false,
          disableClose: true,
          width: '360px',
          maxWidth: '360px',
          data: {
            warning: `La solicitud será anulada.`,
            content: `¿Está seguro de <b>cancelar</b> la solicitud? Si la solicitud
          se encuentra en estado 'Comprobante Confirmado' se repondrá el stock correspondiente`,
            noObservation: true,
            observation: null,
            title: 'Anular',
            titleIcon: 'warning'
          }
        })
      } else {
        dialogRef = this.dialog.open(ConfirmationDialogComponent, {
          closeOnNavigation: false,
          disableClose: true,
          width: '360px',
          maxWidth: '360px',
          data: {
            warning: `La solicitud será actualizada.`,
            content: `¿Está seguro de actualizar la solicitud al estado <b>'${newStatus}'</b>?`,
            noObservation: true,
            observation: null,
            title: 'Actualizar',
            titleIcon: 'warning'
          }
        })
      }
    }

    return dialogRef.afterClosed().pipe(take(1))
  }

  onGetUpdatedSale(newStatus: Sale['status'], user: User): Sale {
    let date = new Date()
    this.productForm.markAsPending();

    let sale: Sale = {
      ...this.sale,
      status: newStatus,
      deliveryPrice: this.productForm.get('deliveryPrice').value,
      total: this.getTotalPrice(),
      requestedProducts: [],
      voucher: this.sale.voucher,
      voucherChecked: this.voucherCheckedForm.value,
      driverAssignedData: null,
      finishedData: null
    };

    sale.requestedProducts = this.getSaleRequestedProducts();
    if (newStatus == this.saleStatusOptions.cancelled) {
      sale.cancelledData = {
        cancelledAt: date,
        cancelledBy: user
      }
    } else {
      sale.cancelledData = null;
      if (/*newStatus == this.saleStatusOptions.confirmedDelivery*/ false) {
        sale.confirmedDeliveryData = {
          confirmedAt: date,
          confirmedBy: user,
          deliveryType: this.confirmedDeliveryForm.get("deliveryType").value ?
            "Moto" : "Biker",
          deliveryBusiness: this.confirmedDeliveryForm.get("deliveryBusiness").value
        }
      } else {
        //Confirmed Document
        sale.confirmedDeliveryData = null
        if (newStatus == this.saleStatusOptions.confirmedDocument) {
          sale.confirmedDocumentData = {
            documentNumber: this.confirmedDocumentForm.get('documentNumber').value,
            confirmedBy: user,
            confirmedAt: date,
          }
        } else {
          //Confirmed Request
          // sale.confirmedDocumentData = null
          if (newStatus == this.saleStatusOptions.confirmedRequest) {
            sale.confirmedRequestData = {
              assignedDate: this.confirmedRequestForm.get('assignedDate').value,
              requestedProductsId: sale.requestedProducts.map(el => el.product.id),
              observation: this.confirmedRequestForm.get('observation').value,
              confirmedBy: user,
              confirmedAt: date,
            }
          } else if (newStatus == this.saleStatusOptions.finished) {
            sale.finishedData = {
              finishedAt: date,
              finishedBy: user,
              observation: this.confirmedRequestForm.get('observation').value
            }
          } else {
            //ATTENDED
            // sale.confirmedRequestData = null
            if (newStatus == this.saleStatusOptions.attended) {
              sale.attendedData = {
                attendedAt: date,
                attendedBy: user
              }
            }
          }
        }
      }
    }
    return sale;
  }

  onUpdateStock(requestedProducts: Sale['requestedProducts'], batch: firebase.firestore.WriteBatch, decrease: boolean) {
    this.dbs.onUpdateStock(requestedProducts, batch, decrease)
  }

  getSaleRequestedProducts(): Sale['requestedProducts'] {
    let requestedProducts: Sale['requestedProducts'] = [];
    (<FormArray>this.productForm.get('productList')).controls.forEach(formGroup => {
      //If product quantity is 0, we don't need to save it again
      if (formGroup.get('quantity').value) {
        if (!(<Product | Package>formGroup.get('product').value).package) {
          requestedProducts.push({
            quantity: formGroup.get('quantity').value,
            product: formGroup.get('product').value
          });
        } else {
          requestedProducts.push({
            quantity: formGroup.get('quantity').value,
            product: formGroup.get('product').value,
            chosenOptions: formGroup.get('chosenOptions').value
          });
        }
      }
    });
    return requestedProducts
  }

  giveProductPrice(item: SaleRequestedProducts): number {
    if (item.product.promo) {
      let promTotalQuantity = Math.floor(item.quantity / item.product.promoData.quantity);
      let promTotalPrice = promTotalQuantity * item.product.promoData.promoPrice;
      let noPromTotalQuantity = item.quantity % item.product.promoData.quantity;
      let noPromTotalPrice = noPromTotalQuantity * item.product.price;
      return promTotalPrice + noPromTotalPrice;
    }
    else {
      return item.quantity * item.product.price
    }
  }

  giveProductWeight(item: SaleRequestedProducts): number {
    if (!item.product.package) {
      return (<Product>item.product).unit.weight * item.quantity;
    } else {
      return item.chosenOptions.map((opt, index) => {
        //if it has a valid chosen product, we use the weight
        if (opt) {
          return opt.unit.weight;
        }
        //If it doesn't have a chosen product, we calculate the minimum
        //of the respective options.
        else {
          return Math.min(
            ...(<Package>item.product).items[index].productsOptions.map(prod => prod.unit.weight)
          )
        }
      }).reduce((a, b) => a + b, 0) * item.quantity
    }
  }

  getTotalPrice(): number {
    let items: SaleRequestedProducts[] = this.productForm.get('productList').value;
    return items.reduce((a, b) => a + this.giveProductPrice(b), 0)
  }

  getTotalWeight(): number {
    let items: SaleRequestedProducts[] = this.productForm.get('productList').value;
    return items.reduce((a, b) => a + this.giveProductWeight(b), 0)
  }

  displayFn(input: Product) {
    if (!input) return '';
    return input.description;
  }

  onFloor(el: number, el2: number): number {
    return Math.floor(el / el2);
  }

  getCorrelative(corr: number) {
    return corr.toString().padStart(4, '0')
  }
}
