import { SaleDialogComponent } from './../sale-dialog/sale-dialog.component';
import { MatDialog } from '@angular/material/dialog';
import { User } from 'src/app/core/models/user.model';
import { AngularFirestore } from '@angular/fire/firestore';
import { Sale, SaleRequestedProducts } from './../../../core/models/sale.model';
import { Ng2ImgMaxService } from 'ng2-img-max';
import { DatabaseService } from 'src/app/core/services/database.service';
import { tap, take, takeLast, map } from 'rxjs/operators';
import { Observable, BehaviorSubject, forkJoin, combineLatest } from 'rxjs';
import { AuthService } from 'src/app/core/services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-purchase',
  templateUrl: './purchase.component.html',
  styleUrls: ['./purchase.component.scss']
})
export class PurchaseComponent implements OnInit {

  user: User = null

  firstSale: boolean = false

  loading = new BehaviorSubject<boolean>(false);
  loading$ = this.loading.asObservable();

  loadingbar = new BehaviorSubject<boolean>(true);
  loadingbar$ = this.loadingbar.asObservable();

  userData$: Observable<any>

  init$: Observable<any>

  order: Array<any>

  name: boolean = false
  total: number = 0
  delivery: number = 6

  firstFormGroup: FormGroup;
  secondFormGroup: FormGroup;
  payFormGroup: FormGroup;

  photosList: Array<any> = []

  payType: Array<any>
  documents: Array<string> = ['Boleta', 'Factura']
  districts: Array<any>

  now: Date

  latitud: number = -12.046301
  longitud: number = -77.031027

  showPhoto: boolean = false
  photos: {
    resizing$: {
      photoURL: Observable<boolean>
    },
    data: File[]
  } = {
      resizing$: {
        photoURL: new BehaviorSubject<boolean>(false)
      },
      data: []
    }

  constructor(
    private auth: AuthService,
    private snackbar: MatSnackBar,
    private fb: FormBuilder,
    private ng2ImgMax: Ng2ImgMaxService,
    private dialog: MatDialog,
    private dbs: DatabaseService,
    private af: AngularFirestore
  ) { }

  ngOnInit(): void {
    let date = new Date()
    this.now = new Date(date.getTime() + (345600000))

    this.init$ = this.dbs.getGeneralConfigDoc().pipe(
      tap(res => {
        this.loadingbar.next(false)
        this.payType = res['payments'].sort((a, b) => {
          const nameA = a.name;
          const nameB = b.name;

          let comparison = 0;
          if (nameA > nameB) {
            comparison = 1;
          } else if (nameA < nameB) {
            comparison = -1;
          }
          return comparison;
        });
        this.districts = res['districts'].sort((a, b) => {
          const nameA = a.name;
          const nameB = b.name;

          let comparison = 0;
          if (nameA > nameB) {
            comparison = 1;
          } else if (nameA < nameB) {
            comparison = -1;
          }
          return comparison;
        });
      })
    )

    this.firstFormGroup = this.fb.group({
      email: [null, [Validators.required, Validators.email]],
      dni: [null, [Validators.required, Validators.minLength(8)]],
      name: [null, [Validators.required]],
      lastname1: [null, [Validators.required]],
      lastname2: [null, [Validators.required]],
      phone: [null, [Validators.required, Validators.minLength(6)]],
    });

    this.secondFormGroup = this.fb.group({
      address: [null, [Validators.required]],
      district: [null, [Validators.required]],
      ref: [null, [Validators.required]]
    });

    this.payFormGroup = this.fb.group({
      pay: [null, [Validators.required]],
      typePay: [null, [Validators.required]],
      photoURL: [null]
    });



    // this.delivery = this.dbs.delivery

    this.total = [...this.dbs.order].map(el => this.giveProductPrice(el)).reduce((a, b) => a + b, 0)
    this.order = [...this.dbs.order]

    this.userData$ = this.auth.user$.pipe(
      tap(res => {
        this.user = res
        this.getData()

      })
    )


  }

  getData() {
    if (this.user) {
      if (this.user['contact']) {
        this.firstFormGroup = this.fb.group({
          email: [this.user['email'], [Validators.required, Validators.email]],
          dni: [this.user['dni'], [Validators.required, Validators.minLength(8)]],
          name: [this.user['name'], [Validators.required]],
          lastname1: [this.user['lastName1'], [Validators.required]],
          lastname2: [this.user['lastName2'], [Validators.required]],
          phone: [this.user.contact.phone, [Validators.required, Validators.minLength(6)]],
        });

        if (this.districts.find(el => el.name == this.user.contact.district.name)) {
          this.secondFormGroup = this.fb.group({
            address: [this.user.contact.address, [Validators.required]],
            district: [this.user.contact.district, [Validators.required]],
            ref: [this.user.contact.reference, [Validators.required]]
          });
          this.changeDelivery(this.user.contact.district)
        } else {
          this.secondFormGroup = this.fb.group({
            address: [this.user.contact.address, [Validators.required]],
            district: [null, [Validators.required]],
            ref: [this.user.contact.reference, [Validators.required]]
          });
        }

        this.latitud = this.user.contact.coord.lat
        this.longitud = this.user.contact.coord.lng

      } else {
        this.firstSale = true

        this.firstFormGroup = this.fb.group({
          email: [this.user['email'], [Validators.required, Validators.email]],
          dni: [null, [Validators.required, Validators.minLength(8)]],
          name: [this.user['displayName'], [Validators.required]],
          lastname1: [null, [Validators.required]],
          lastname2: [null, [Validators.required]],
          phone: [null, [Validators.required, Validators.minLength(6)]],
        });

        this.firstFormGroup.get('email').disable()

        if (this.user['displayName']) {
          this.name = true
        }
      }
    }
  }

  giveProductPrice(item) {
    if (item.product.promo) {
      let promTotalQuantity = Math.floor(item.quantity / item.product.promoData.quantity);
      let promTotalPrice = promTotalQuantity * item.product.promoData.promoPrice;
      let noPromTotalQuantity = item.quantity % item.product.promoData.quantity;
      let noPromTotalPrice = noPromTotalQuantity * item.product.price;
      return Number((promTotalPrice + noPromTotalPrice).toFixed(1));
    }
    else {
      return Number((item.quantity * item.product.price).toFixed(1));
    }
  }

  changeDelivery(district) {
    this.dbs.delivery = district['delivery']
    this.delivery = district['delivery']
  }

  roundNumber(number) {
    return Number(parseFloat(number).toFixed(1));
  }

  eliminatedphoto(ind) {
    this.photosList.splice(ind, 1)
    this.photos.data.splice(ind, 1)

    if (this.photosList.length == 0) {
      this.payFormGroup.get('photoURL').setValue(null);
    }

  }

  compareObjects(o1: any, o2: any): boolean {
    return o1.name === o2.name && o1.delivery === o2.delivery;
  }

  findMe() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((posicion) => {
        this.latitud = posicion.coords.latitude;
        this.longitud = posicion.coords.longitude;

      }, function (error) {
        alert("Tenemos un problema para encontrar tu ubicación");
      });
    }
  }

  mapClicked($event: MouseEvent) {
    this.latitud = $event['coords']['lat'];
    this.longitud = $event['coords']['lng'];
  }

  addNewPhoto(formControlName: string, image: File[]) {
    this.payFormGroup.get(formControlName).setValue(null);
    if (image.length === 0)
      return;
    let reader = new FileReader();
    this.photos.resizing$[formControlName].next(true);

    this.ng2ImgMax.resizeImage(image[0], 10000, 426)
      .pipe(
        take(1)
      ).subscribe(result => {
        this.photos.data.push(new File([result], formControlName + this.photosList.length + result.name.match(/\..*$/)))
        reader.readAsDataURL(image[0]);
        reader.onload = (_event) => {
          this.photosList.push({
            img: reader.result,
            show: false
          })
          this.payFormGroup.get(formControlName).setValue(reader.result);
          this.photos.resizing$[formControlName].next(false);
        }
      },
        error => {
          this.photos.resizing$[formControlName].next(false);
          this.snackbar.open('Por favor, elija una imagen en formato JPG, o PNG', 'Aceptar');
          this.payFormGroup.get(formControlName).setValue(null);

        }
      );
  }

  updateUser() {
    this.user.name = this.firstFormGroup.get('name').value
    this.user.lastName1 = this.firstFormGroup.get('lastname1').value
    this.user.lastName2 = this.firstFormGroup.get('lastname2').value
    this.user.dni = this.firstFormGroup.get('dni').value

    if (!this.user.contact) {
      this.user['contact'] = {
        address: '',
        district: {
          delivery: 0,
          name: ''
        },
        coord: {
          lat: 0,
          lng: 0
        },
        reference: '',
        phone: 0
      }
    }

    this.user.contact.address = this.secondFormGroup.get('address').value
    this.user.contact.phone = this.firstFormGroup.get('phone').value
    this.user.contact.district = this.secondFormGroup.get('district').value
    this.user.contact.reference = this.secondFormGroup.get('ref').value
    this.user.contact.coord.lat = this.latitud
    this.user.contact.coord.lng = this.longitud


  }

  openSale() {
    this.dialog.open(SaleDialogComponent, {
      data: {
        name: this.firstFormGroup.value['name'],
        number: 10,
        email: this.user.email
      }
    })
  }

  prueba() {
    this.updateUser()
    if (this.firstFormGroup.valid && this.secondFormGroup.valid) {
      if (this.payFormGroup.valid) {
        if (!this.payFormGroup.value['photoURL'] && (this.payFormGroup.value['pay']['name'] === 'BCP' || this.payFormGroup.value['pay']['name'] === 'YAPE')) {
          this.snackbar.open('Por favor adjunte una imagen de su voucher de pago', 'cerrar')
        } else {
          this.save()
        }
      } else {
        this.payFormGroup.markAllAsTouched()
      }
    } else {
      this.snackbar.open('Parece que hubo un problema, complete todos los campos anteriores', 'cerrar')
    }

  }

  getneworder() {

    let copy = [...this.order]
    let newOrder: any = [...copy].map(order => {
      if (order['chosenOptions']) {
        return order['chosenOptions'].map(el => {
          return {
            product: el,
            quantity: el.quantity * order.quantity
          }
        })
      } else {
        return [order]
      }
    })

    let otherorder = [...newOrder].reduce((a, b) => a.concat(b), []).map((el, index, array) => {
      let counter = 0
      let others = []
      let reduce = 0
      array.forEach(al => {
        if (al.product['id'] == el.product['id']) {
          counter++
          others.push(al.quantity)
        }
      })
      if (counter > 1) {
        reduce = others.reduce((d, e) => d + e, 0)
      } else {
        reduce = el.quantity
      }

      return {
        product: el.product,
        reduce: reduce
      }
    }).filter((dish, index, array) => array.findIndex(el => el.product['id'] === dish.product['id']) === index)

    return otherorder


  }

  save() {
    this.loading.next(true)
    let reduceOrder = this.getneworder()
    this.af.firestore.runTransaction((transaction) => {
      let promises = []
      reduceOrder.forEach((order, ind) => {
        const sfDocRef = this.af.firestore.collection(`/db/haku/productsList`).doc(order.product.id);

        promises.push(transaction.get(sfDocRef).then((prodDoc) => {

          let newStock = prodDoc.data().realStock - order.reduce;
          transaction.update(sfDocRef, { realStock: newStock });

        }).catch(function (error) {
          console.log("Transaction failed: ", error);
        }));


      })
      return Promise.all(promises);
    }).then(() => {
      this.savePurchase()


    }).catch(() => {
      this.snackbar.open('Error de conexión, no se completo la compra, intentelo de nuevo', 'cerrar')
    })
  }

  savePurchase() {
    const saleCount = this.af.firestore.collection(`/db/haku/config/`).doc('generalConfig');
    const saleRef = this.af.firestore.collection(`/db/haku/sales`).doc();

    let newSale: Sale = {
      id: saleRef.id,
      correlative: 0,
      correlativeType: 'R',
      document: this.payFormGroup.get('typePay').value,
      payType: this.payFormGroup.get('pay').value,
      location: {
        address: this.secondFormGroup.get('address').value,
        district: this.secondFormGroup.get('district').value,
        reference: this.secondFormGroup.get('ref').value,
        coord: {
          lat: this.latitud,
          lng: this.longitud
        },
        phone: this.firstFormGroup.get('phone').value
      },
      requestDate: null,
      createdAt: new Date(),
      createdBy: null,
      user: this.user,
      requestedProducts: this.dbs.order,
      status: 'Solicitado',
      total: this.total,
      deliveryPrice: this.dbs.delivery,
      voucher: [],
      voucherChecked: false
    }

    const email = {
      to: this.user.email,
      template: {
        name: 'saleEmail'
      }
    }
    const emailRef = this.af.firestore.collection(`/mail`).doc();

    let userCorrelative = 1
    const ref = this.af.firestore.collection(`/users`).doc(this.user.uid);


    if (this.user.salesCount) {
      userCorrelative = this.user.salesCount + 1
    }

    let photos = [...this.photos.data.map(el => this.dbs.uploadPhotoVoucher(saleRef.id, el))]

    if (photos.length) {
      forkJoin(photos).pipe(
        takeLast(1),
      ).subscribe((res: string[]) => {
        newSale.voucher = [...this.photos.data.map((el, i) => {
          return {
            voucherPhoto: res[i],
            voucherPath: `/sales/vouchers/${saleRef.id}-${el.name}`
          }
        })]

        return this.af.firestore.runTransaction((transaction) => {
          return transaction.get(saleCount).then((sfDoc) => {
            if (!sfDoc.exists) {
              transaction.set(saleCount, { salesRCounter: 0 });
            }

            //sales
            ////generalCounter
            let newCorr = 1
            if (sfDoc.data().salesRCounter) {
              newCorr = sfDoc.data().salesRCounter + 1;
            }

            transaction.update(saleCount, { salesRCounter: newCorr });

            newSale.correlative = newCorr

            transaction.set(saleRef, newSale);
            //email
            transaction.set(emailRef, email)
            //user
            transaction.update(ref, {
              contact: newSale.location,
              name: this.firstFormGroup.value['name'],
              lastName1: this.firstFormGroup.value['lastname1'],
              lastName2: this.firstFormGroup.value['lastname2'],
              dni: this.firstFormGroup.value['dni'],
              salesCount: userCorrelative
            })

          });

        }).then(() => {
          this.dialog.open(SaleDialogComponent, {
            data: {
              name: this.firstFormGroup.value['name'],
              number: newSale.correlative,
              email: this.user.email
            }
          })

          this.dbs.order = []
          this.dbs.total = 0
          this.dbs.view.next(1)
          this.loading.next(false)
        }).catch(function (error) {
          this.snackbar.open('Error de conexión, no se completo la compra, intentelo de nuevo', 'cerrar')
        });
      })
    } else {
      return this.af.firestore.runTransaction((transaction) => {
        return transaction.get(saleCount).then((sfDoc) => {
          if (!sfDoc.exists) {
            transaction.set(saleCount, { salesRCounter: 0 });
          }

          //sales
          ////generalCounter
          let newCorr = 1
          if (sfDoc.data().salesRCounter) {
            newCorr = sfDoc.data().salesRCounter + 1;
          }

          transaction.update(saleCount, { salesRCounter: newCorr });

          newSale.correlative = newCorr

          transaction.set(saleRef, newSale);
          //email
          transaction.set(emailRef, email)
          //user
          transaction.update(ref, {
            contact: newSale.location,
            name: this.firstFormGroup.value['name'],
            lastName1: this.firstFormGroup.value['lastname1'],
            lastName2: this.firstFormGroup.value['lastname2'],
            dni: this.firstFormGroup.value['dni'],
            salesCount: userCorrelative
          })

        });

      }).then(() => {
        this.dialog.open(SaleDialogComponent, {
          data: {
            name: this.firstFormGroup.value['name'],
            number: newSale.correlative,
            email: this.user.email
          }
        })

        this.dbs.order = []
        this.dbs.total = 0
        this.dbs.view.next(1)
        this.loading.next(false)
      }).catch(function (error) {
        this.snackbar.open('Error de conexión, no se completo la compra, intentelo de nuevo', 'cerrar')
      });
    }
  }

  // save() {
  //   this.loading.next(true)

  //   const saleCount = this.af.firestore.collection(`/db/haku/config/`).doc('generalConfig');
  //   const saleRef = this.af.firestore.collection(`/db/haku/sales`).doc();

  //   let newSale: Sale = {
  //     id: saleRef.id,
  //     correlative: 0,
  //     correlativeType: 'R',
  //     document: this.payFormGroup.get('typePay').value,
  //     payType: this.payFormGroup.get('pay').value,
  //     location: {
  //       address: this.secondFormGroup.get('address').value,
  //       district: this.secondFormGroup.get('district').value,
  //       reference: this.secondFormGroup.get('ref').value,
  //       coord: {
  //         lat: this.latitud,
  //         lng: this.longitud
  //       },
  //       phone: this.firstFormGroup.get('phone').value
  //     },
  //     requestDate: null,
  //     createdAt: new Date(),
  //     createdBy: null,
  //     user: this.user,
  //     requestedProducts: this.dbs.order,
  //     status: 'Solicitado',
  //     total: this.total,
  //     deliveryPrice: this.delivery,
  //     voucher: [],
  //     voucherChecked: false
  //   }


  //   let userCorrelative = 1
  //   const ref = this.af.firestore.collection(`/users`).doc(this.user.uid);


  //   if (this.user.salesCount) {
  //     userCorrelative = this.user.salesCount + 1
  //   }

  //   let photos = [...this.photos.data.map(el => this.dbs.uploadPhotoVoucher(saleRef.id, el))]

  //   if (photos.length) {
  //     forkJoin(photos).pipe(
  //       takeLast(1),
  //     ).subscribe((res: string[]) => {
  //       newSale.voucher = [...this.photos.data.map((el, i) => {
  //         return {
  //           voucherPhoto: res[i],
  //           voucherPath: `/sales/vouchers/${saleRef.id}-${el.name}`
  //         }
  //       })]

  //       return this.af.firestore.runTransaction((transaction) => {
  //         return transaction.get(saleCount).then((sfDoc) => {
  //           if (!sfDoc.exists) {
  //             transaction.set(saleCount, { salesRCounter: 0 });
  //           }

  //           //sales
  //           ////generalCounter
  //           let newCorr = 1
  //           if (sfDoc.data().salesRCounter) {
  //             newCorr = sfDoc.data().salesRCounter + 1;
  //           }

  //           transaction.update(saleCount, { salesRCounter: newCorr });

  //           newSale.correlative = newCorr

  //           transaction.set(saleRef, newSale);
  //           //user
  //           transaction.update(ref, {
  //             contact: newSale.location,
  //             name: this.firstFormGroup.value['name'],
  //             lastName1: this.firstFormGroup.value['lastname1'],
  //             lastName2: this.firstFormGroup.value['lastname2'],
  //             dni: this.firstFormGroup.value['dni'],
  //             salesCount: userCorrelative
  //           })

  //         });

  //       }).then(() => {
  //         let copy = [...this.dbs.order]
  //         let newOrder: any = [...copy].map(order => {
  //           if (order['chosenOptions']) {
  //             return order['chosenOptions'].map(el => {
  //               return {
  //                 product: el,
  //                 quantity: 1 * order.quantity
  //               }
  //             })
  //           } else {
  //             return [order]
  //           }
  //         })

  //         this.order = newOrder.reduce((a, b) => a.concat(b), []).map((el, index, array) => {
  //           let counter = 0
  //           array.forEach(al => {
  //             if (al.product['id'] == el.product['id']) {
  //               counter++
  //             }
  //           })

  //           el['quantity'] = counter
  //           return el
  //         }).filter((dish, index, array) => array.findIndex(el => el.product['id'] === dish.product['id']) === index)

  //         this.order.forEach((order, ind) => {
  //           const ref = this.af.firestore.collection(`/db/haku/productsList`).doc(order.product.id);
  //           this.af.firestore.runTransaction((transaction) => {
  //             return transaction.get(ref).then((prodDoc) => {
  //               let newStock = prodDoc.data().realStock - order.quantity;
  //               transaction.update(ref, { realStock: newStock });
  //             });
  //           }).then(() => {
  //             if (ind == this.order.length - 1) {
  //               this.dialog.open(SaleDialogComponent, {
  //                 data: {
  //                   name: this.firstFormGroup.value['name'],
  //                   number: newSale.correlative,
  //                   email: this.user.email
  //                 }
  //               })

  //               this.dbs.order = []
  //               this.dbs.total = 0
  //               this.dbs.view.next(1)
  //               this.loading.next(false)
  //             }

  //           })
  //         })
  //       }).catch(function (error) {
  //         console.log("Transaction failed: ", error);
  //       });
  //     })
  //   } else {
  //     return this.af.firestore.runTransaction((transaction) => {
  //       return transaction.get(saleCount).then((sfDoc) => {
  //         if (!sfDoc.exists) {
  //           transaction.set(saleCount, { salesRCounter: 0 });
  //         }

  //         //sales
  //         ////generalCounter
  //         let newCorr = 1
  //         if (sfDoc.data().salesRCounter) {
  //           newCorr = sfDoc.data().salesRCounter + 1;
  //         }

  //         transaction.update(saleCount, { salesRCounter: newCorr });

  //         newSale.correlative = newCorr

  //         transaction.set(saleRef, newSale);
  //         //user
  //         transaction.update(ref, {
  //           contact: newSale.location,
  //           name: this.firstFormGroup.value['name'],
  //           lastName1: this.firstFormGroup.value['lastname1'],
  //           lastName2: this.firstFormGroup.value['lastname2'],
  //           dni: this.firstFormGroup.value['dni'],
  //           salesCount: userCorrelative
  //         })

  //       });

  //     }).then(() => {
  //       let copy = [...this.dbs.order]
  //       let newOrder: any = [...copy].map(order => {
  //         if (order['chosenOptions']) {
  //           return order['chosenOptions'].map(el => {
  //             return {
  //               product: el,
  //               quantity: 1 * order.quantity
  //             }
  //           })
  //         } else {
  //           return [order]
  //         }
  //       })

  //       this.order = newOrder.reduce((a, b) => a.concat(b), []).map((el, index, array) => {
  //         let counter = 0
  //         array.forEach(al => {
  //           if (al.product['id'] == el.product['id']) {
  //             counter++
  //           }
  //         })

  //         el['quantity'] = counter
  //         return el
  //       }).filter((dish, index, array) => array.findIndex(el => el.product['id'] === dish.product['id']) === index)

  //       this.order.forEach((order, ind) => {
  //         const ref = this.af.firestore.collection(`/db/haku/productsList`).doc(order.product.id);
  //         this.af.firestore.runTransaction((transaction) => {
  //           return transaction.get(ref).then((prodDoc) => {
  //             let newStock = prodDoc.data().realStock - order.quantity;
  //             transaction.update(ref, { realStock: newStock });
  //           });
  //         }).then(() => {
  //           if (ind == this.order.length - 1) {
  //             this.dialog.open(SaleDialogComponent, {
  //               data: {
  //                 name: this.firstFormGroup.value['name'],
  //                 number: newSale.correlative,
  //                 email: this.user.email
  //               }
  //             })

  //             this.dbs.order = []
  //             this.dbs.total = 0
  //             this.dbs.view.next(1)
  //             this.loading.next(false)
  //           }

  //         })
  //       })
  //     }).catch(function (error) {
  //       console.log("Transaction failed: ", error);
  //     });
  //   }




  // }

}
