import { Sale } from './../models/sale.model';
import { Injectable } from '@angular/core';
import { AngularFirestore, DocumentReference, AngularFirestoreDocument } from '@angular/fire/firestore';
import { Product } from '../models/product.model';
import { shareReplay, map, takeLast, switchMap, take, mapTo } from 'rxjs/operators';
import { GeneralConfig } from '../models/generalConfig.model';
import { Observable, concat, of, interval, BehaviorSubject } from 'rxjs';
import { User } from '../models/user.model';
import { AngularFireStorage } from '@angular/fire/storage';
import { Recipe } from '../models/recipe.model';
import { Unit, PackageUnit } from '../models/unit.model';
import { Buy, BuyRequestedProduct } from '../models/buy.model';
import * as firebase from 'firebase'
import { Package } from '../models/package.model';
import { Ticket } from '../models/ticket.model';
import { StoreSale } from '../models/storeSale.model';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  public version: string = 'V1.0.2r';
  public isOpen: boolean = false;
  public isAdmin: boolean = false;

  public order: {
    product: any,
    quantity: number,
    chosenOptions?: Product[]
  }[] = []

  public view = new BehaviorSubject<number>(1);
  public view$ = this.view.asObservable();

  public sum = new BehaviorSubject<number>(0);
  public sum$ = this.sum.asObservable();

  public total: number = 0
  public delivery: number = 6

  // public opening = new BehaviorSubject<Array<{ opening: string, closing: string }>>([]);
  public opening$: Observable<Array<{ opening: string, closing: string }>>;


  // POS variables
  public tabs: Array<Ticket> = [];
  public tabCounter = 0;

  public titleSource = new BehaviorSubject<string>('Cargando ...');
  public currentTitle$ = this.titleSource.asObservable();

  constructor(
    private afs: AngularFirestore,
    private storage: AngularFireStorage,
  ) {
    this.opening$ = this.getOpening();
  }

  productsListRef = `db/24multiservicios/productsList`;
  packagesListRef = `db/24multiservicios/packagesList`;
  recipesRef = `db/24multiservicios/recipes`;
  buysRef = `db/24multiservicios/buys`;
  salesRef = `db/24multiservicios/sales`;
  storeSalesRef = `db/24multiservicios/storeSales`;
  configRef = `db/24multiservicios/config`;
  generalConfigDoc = this.afs.collection(this.configRef).doc<GeneralConfig>('generalConfig');

  changeTitle(newTitle: string): void {
    this.titleSource.next(newTitle);
  }

  getOpening(): Observable<Array<{ opening: string, closing: string }>> {
    return this.afs.collection(this.configRef).doc('generalConfig').valueChanges()
      .pipe(
        map(res => res['opening']),
        shareReplay(1)
      )
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

  //users

  getUserDisplayName(userId: string): Observable<string> {
    return this.afs.collection(`/users`).doc(userId)
      .valueChanges().pipe(
        take<User>(1),
        map((user) => {
          if (user.name && user.lastName1) {
            return user.name.split(" ")[0] + " " + user.lastName1.split(" ")[0]
          }
          if (user.displayName) {
            return user.displayName.split(" ").slice(0, 2).join(" ")
          }
          return "Sin nombre"
        })
      );
  }

  getUsers(): Observable<User[]> {
    return this.afs.collection<User>(`/users`, ref => ref.orderBy("email", 'asc'))
      .valueChanges().pipe(
        shareReplay(1)
      );
  }

  getUsersStatic(): Observable<User[]> {
    return this.afs.collection<User>(`/users`)
      .get().pipe(map((snap) => {
        return snap.docs.map(el => <User>el.data())
      }));
  }

  getGeneralConfigDoc(): Observable<GeneralConfig> {
    return this.generalConfigDoc.valueChanges().pipe(
      shareReplay(1))
  }

  getStaticConfigDoc(): Observable<GeneralConfig> {
    return this.afs.collection(this.configRef).doc('generalConfig').get().pipe(map((snap) => {
      return <GeneralConfig>snap.data()
    }));
  }

  getCategoriesDoc(): Observable<any> {
    return this.generalConfigDoc.get().pipe(map((snap) => {
      return snap.data()['categories']
    }));
  }

  ////////////////////////////////////////////////////////////////////////////////
  //Products list/////////////////////////////////////////////////////////////////
  getProductsList(): Observable<Product[]> {
    return this.afs.collection<Product>(this.productsListRef, ref => ref.orderBy("priority", "desc"))
      .get().pipe(map((snap) => {
        return snap.docs.map(el => <Product>el.data())
      }));
  }

  getProductsListValueChanges() {
    return this.afs.collection<Product>(this.productsListRef, ref => ref.orderBy("priority", "desc"))
      .valueChanges().pipe(
        shareReplay(1)
      );
  }

  getProductsListCategoriesValueChanges(): Observable<any[]> {
    return this.getGeneralConfigDoc().pipe(map(res => {
      if (res) {
        if (res.hasOwnProperty('categories')) {
          return res.categories
        }
        else {
          return []
        }
      } else {
        return []
      }
    }))
  }

  getProductsListUnitsValueChanges(): Observable<Unit[]> {
    return this.getGeneralConfigDoc().pipe(map(res => {
      if (res) {
        if (res.hasOwnProperty('units')) {
          return res.units
        }
        else {
          return []
        }
      } else {
        return []
      }
    }), shareReplay(1))
  }

  editCategories(categories: string[]): firebase.firestore.WriteBatch {
    let categoriesRef: AngularFirestoreDocument<GeneralConfig>
      = this.generalConfigDoc
    let batch = this.afs.firestore.batch();
    batch.set(categoriesRef.ref, { categories }, { merge: true })
    return batch;
  }

  editUnits(units: Unit[] | PackageUnit[], packageUnit: boolean): firebase.firestore.WriteBatch {
    let unitsRef: AngularFirestoreDocument<GeneralConfig>
      = this.generalConfigDoc
    let batch = this.afs.firestore.batch();
    batch.set(unitsRef.ref, packageUnit ? { packagesUnits: units } : { units }, { merge: true })
    return batch;
  }

  createEditProduct(edit: boolean, product: Product, oldProduct?: Product, photo?: File): Observable<firebase.firestore.WriteBatch> {
    let productRef: DocumentReference;
    let productData: Product;
    let batch = this.afs.firestore.batch();

    //Editting
    if (edit) {
      productRef = this.afs.firestore.collection(this.productsListRef).doc(oldProduct.id);
      productData = product;
      productData.id = productRef.id;
      productData.photoURL = oldProduct.photoURL;
      productData.promo = oldProduct.promo;
    }
    //creating
    else {
      productRef = this.afs.firestore.collection(this.productsListRef).doc();
      productData = product;
      productData.id = productRef.id;
      productData.photoURL = null;
    }

    //With or without photo
    if (photo) {
      if (edit) {
        return concat(
          this.deletePhotoProduct(oldProduct.photoPath).pipe(takeLast(1)),
          this.uploadPhotoProduct(productRef.id, photo).pipe(takeLast(1))
        ).pipe(
          takeLast(1),
          map((res: string) => {
            productData.photoURL = res;
            productData.photoPath = `/productsList/pictures/${productRef.id}-${photo.name}`;
            batch.set(productRef, productData, { merge: true });
            return batch
          })
        )
      }
      else {
        return this.uploadPhotoProduct(productRef.id, photo).pipe(
          takeLast(1),
          map((res: string) => {
            productData.photoURL = res;
            productData.photoPath = `/productsList/pictures/${productRef.id}-${photo.name}`;
            batch.set(productRef, productData, { merge: true });
            return batch
          })
        )
      }
    }
    else {
      batch.set(productRef, productData, { merge: true });
      return of(batch);
    }
  }

  publishProduct(published: boolean, product: Product, user: User): firebase.firestore.WriteBatch {
    let productRef: DocumentReference = this.afs.firestore.collection(this.productsListRef).doc(product.id);
    let batch = this.afs.firestore.batch();
    batch.update(productRef, { published: published })
    return batch;
  }

  increasePriority(product: Product | Package): firebase.firestore.WriteBatch {
    // works with both products and packages 
    let productRef: DocumentReference = product.package ? this.afs.firestore.collection(this.packagesListRef).doc(product.id) : this.afs.firestore.collection(this.productsListRef).doc(product.id);
    let batch = this.afs.firestore.batch();
    batch.update(productRef, { priority: product.priority })
    return batch;
  }

  decreasePriority(product: Product | Package): firebase.firestore.WriteBatch {
    // works with both products and packages
    let productRef: DocumentReference = product.package ? this.afs.firestore.collection(this.packagesListRef).doc(product.id) : this.afs.firestore.collection(this.productsListRef).doc(product.id);
    let batch = this.afs.firestore.batch();
    batch.update(productRef, { priority: product.priority })
    return batch;
  }

  deleteProduct(product: Product): Observable<firebase.firestore.WriteBatch> {
    let productRef: DocumentReference = this.afs.firestore.collection(this.productsListRef).doc(product.id)
    let batch = this.afs.firestore.batch();
    batch.delete(productRef)
    return this.deletePhotoProduct(product.photoPath).pipe(
      takeLast(1),
      mapTo(batch)
    )
  }

  uploadPhotoProduct(id: string, file: File): Observable<string | number> {
    const path = `/productsList/pictures/${id}-${file.name}`;

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
      interval(1000).pipe(take(2)),
      url$)
    return upload$;
  }

  deletePhotoProduct(path: string): Observable<any> {
    let st = this.storage.ref(path);
    return st.delete().pipe(takeLast(1));
  }

  editProductPromo(productId: string, promo: boolean, promoData: Product['promoData'] | Package['promoData'], pack?: boolean): firebase.firestore.WriteBatch {
    let productRef: DocumentReference;
    let batch = this.afs.firestore.batch();

    //Editting
    productRef = this.afs.firestore.collection(
      pack ? this.packagesListRef : this.productsListRef).doc(productId);
    batch.update(productRef, {
      promo,
      promoData: {
        promoPrice: promoData.promoPrice,
        quantity: promoData.quantity
      }
    });
    return batch;
  }
  ////////////////////////////////////////////////////////////////////////////////
  //Packages list/////////////////////////////////////////////////////////////////
  getPackagesList(): Observable<Package[]> {
    return this.afs.collection<Package>(this.packagesListRef, ref => ref.orderBy("priority", "desc"))
      .get().pipe(map((snap) => {
        return snap.docs.map(el => <Package>el.data())
      }));
  }

  getPackagesListValueChanges(): Observable<Package[]> {
    return this.afs.collection<Package>(this.packagesListRef, ref => ref.orderBy("priority", "desc"))
      .valueChanges().pipe(
        shareReplay(1)
      );
  }

  getPackagesListUnitsValueChanges(): Observable<PackageUnit[]> {
    return this.getGeneralConfigDoc().pipe(map(res => {
      if (res) {
        if (res.hasOwnProperty('packagesUnits')) {
          return res.packagesUnits
        }
        else {
          return []
        }
      } else {
        return []
      }
    }), shareReplay(1))
  }

  createEditPackage(edit: boolean, pack: Package, oldPackage?: Package, photo?: File): Observable<firebase.firestore.WriteBatch> {
    let packageRef: DocumentReference;
    let packageData: Package;
    let batch = this.afs.firestore.batch();

    //Editting
    if (edit) {
      packageRef = this.afs.firestore.collection(this.packagesListRef).doc(oldPackage.id);
      packageData = pack;
      packageData.id = packageRef.id;
      packageData.photoURL = oldPackage.photoURL;
      packageData.promo = oldPackage.promo;
    }
    //creating
    else {
      packageRef = this.afs.firestore.collection(this.packagesListRef).doc();
      packageData = pack;
      packageData.id = packageRef.id;
      packageData.photoURL = null;
    }

    //With or without photo
    if (photo) {
      if (edit) {
        return concat(
          this.deletePhotoPackage(oldPackage.photoPath).pipe(takeLast(1)),
          this.uploadPhotoPackage(packageRef.id, photo).pipe(takeLast(1))
        ).pipe(
          takeLast(1),
          map((res: string) => {
            packageData.photoURL = res;
            packageData.photoPath = `/packagesList/pictures/${packageRef.id}-${photo.name}`;
            batch.set(packageRef, packageData, { merge: true });
            return batch
          })
        )
      }
      else {
        return this.uploadPhotoPackage(packageRef.id, photo).pipe(
          takeLast(1),
          map((res: string) => {
            packageData.photoURL = res;
            packageData.photoPath = `/packagesList/pictures/${packageRef.id}-${photo.name}`;
            batch.set(packageRef, packageData, { merge: true });
            return batch
          })
        )
      }
    }
    else {
      batch.set(packageRef, packageData, { merge: true });
      return of(batch);
    }
  }

  publishPackage(published: boolean, pack: Package, user: User): firebase.firestore.WriteBatch {
    let packageRef: DocumentReference = this.afs.firestore.collection(this.packagesListRef).doc(pack.id);
    let batch = this.afs.firestore.batch();
    batch.update(packageRef, { published: published })
    return batch;
  }

  deletePackage(pack: Package): Observable<firebase.firestore.WriteBatch> {
    let packageRef: DocumentReference = this.afs.firestore.collection(this.packagesListRef).doc(pack.id)
    let batch = this.afs.firestore.batch();
    batch.delete(packageRef)
    return this.deletePhotoPackage(pack.photoPath).pipe(
      takeLast(1),
      mapTo(batch)
    )
  }

  uploadPhotoPackage(id: string, file: File): Observable<string | number> {
    const path = `/packagesList/pictures/${id}-${file.name}`;

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
      interval(1000).pipe(take(2)),
      url$)
    return upload$;
  }

  deletePhotoPackage(path: string): Observable<any> {
    let st = this.storage.ref(path);
    return st.delete().pipe(takeLast(1));
  }


  ////////////////////////////////////////////////////////////////////////////////
  //Products//////////////////////////////////////////////////////////////////////
  createEditRecipe(recipe: Recipe, edit: boolean): firebase.firestore.WriteBatch {
    let recipeRef: DocumentReference;
    let recipeData: Recipe = recipe;
    let batch = this.afs.firestore.batch();
    if (edit) {
      recipeRef = this.afs.firestore.collection(this.recipesRef).doc(recipe.id);
    } else {
      recipeRef = this.afs.firestore.collection(this.recipesRef).doc();
      recipeData.id = recipeRef.id;
    }
    batch.set(recipeRef, recipeData);
    return batch;
  }

  getRecipes(): Observable<Recipe[]> {
    return this.afs.collection<Recipe>(this.recipesRef, ref => ref.orderBy("name", "asc"))
      .get().pipe(map((snap) => {
        return snap.docs.map(el => <Recipe>el.data())
      }));
  }

  /*sales*/

  uploadPhotoVoucher(id: string, file: File): Observable<string | number> {
    if (file) {
      const path = `/sales/vouchers/${id}-${file.name}`;

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
    } else {
      return of(null);
    }

  }

  getProductRecipesValueChanges(productId: string): Observable<Recipe[]> {
    return this.afs.collection<Recipe>(this.recipesRef,
      ref => ref.where("productsId", "array-contains", productId)).valueChanges()
  }

  getSalesUser(user: string): Observable<Sale[]> {
    return this.afs.collection<Sale>(`/db/24multiservicios/sales`,
      ref => ref.where("user.uid", "==", user)).valueChanges()
  }

  //Logistics
  getBuysCorrelativeValueChanges(): Observable<number> {
    return this.getGeneralConfigDoc().pipe(map(res => {
      if (res) {
        if (res.hasOwnProperty('buysCounter')) {
          return res.buysCounter + 1
        }
        else {
          return 0
        }
      } else {
        return 0
      }
    }), shareReplay(1))
  }

  getBuyRequests(date: { begin: Date, end: Date }): Observable<Buy[]> {
    return this.afs.collection<Buy>(this.buysRef,
      ref => ref.where("requestedDate", "<=", date.end).where("requestedDate", ">=", date.begin))
      .valueChanges().pipe(map(res => res.sort((a, b) => b.correlative - a.correlative)));
  }

  createEditBuyRequest(request: Buy, requestedProducts: BuyRequestedProduct[], edit: boolean, oldBuyRequest: Buy):
    Promise<void> {

    let configRef: DocumentReference = this.afs.firestore.collection(this.configRef).doc('generalConfig');

    let buyRef: DocumentReference = !edit ? this.afs.firestore.collection(this.buysRef).doc() :
      this.afs.firestore.collection(this.buysRef).doc(oldBuyRequest.id);

    let buyData: Buy = request;
    buyData.id = buyRef.id;

    let requestedProductRef: DocumentReference;
    let requestedProductData: BuyRequestedProduct;

    let batch = this.afs.firestore.batch()

    if (edit) {
      //adding docs for requested products
      requestedProducts.forEach(product => {
        requestedProductRef = this.afs.firestore.collection(
          this.buysRef + `/${buyRef.id}/buyRequestedProducts`).doc(product.id)
        requestedProductData = product;
        requestedProductData.buyId = buyRef.id;
        batch.set(requestedProductRef, requestedProductData);
      })
      //deleting deleted products
      let deletedProducts = oldBuyRequest.requestedProducts.filter(el =>
        !request.requestedProducts.find(el2 => el2 == el)
      )
      deletedProducts.forEach(productId => {
        requestedProductRef = this.afs.firestore.collection(
          this.buysRef + `/${buyRef.id}/buyRequestedProducts`).doc(productId)
        batch.delete(requestedProductRef);
      })
      //buy data
      batch.set(buyRef, buyData);

      return batch.commit()

    } else {
      return this.afs.firestore.runTransaction((transaction) => {
        // This code may get re-run multiple times if there are conflicts.
        return transaction.get(configRef).then((sfDoc) => {

          //adding docs for requested products
          requestedProducts.forEach(product => {
            requestedProductRef = this.afs.firestore.collection(
              this.buysRef + `/${buyRef.id}/buyRequestedProducts`).doc(product.id)
            requestedProductData = product;
            requestedProductData.buyId = buyRef.id;
            transaction.set(requestedProductRef, requestedProductData);
          })

          //counter
          if (!sfDoc.exists) {
            transaction.set(configRef, { buysCounter: 1 }, { merge: true });
          } else {
            let config = <GeneralConfig>sfDoc.data()

            if (!config.hasOwnProperty("buysCounter")) {
              transaction.set(configRef, { buysCounter: 1 }, { merge: true });
              buyData.correlative = 1;
              transaction.set(buyRef, buyData);
            } else {
              transaction.update(configRef, { buysCounter: config.buysCounter + 1 })
              buyData.correlative = config.buysCounter + 1;
              transaction.set(buyRef, buyData);
            }
          }
        });
      });
    }
  }

  getBuyRequestedProducts(request: string): Observable<BuyRequestedProduct[]> {
    return this.afs.collection<BuyRequestedProduct>(this.buysRef + `/${request}/buyRequestedProducts`,
      ref => ref.orderBy("productDescription")).valueChanges();
  }

  getVirtualStock(product: Product): Observable<BuyRequestedProduct[]> {
    return this.afs.collectionGroup<BuyRequestedProduct>('buyRequestedProducts',
      ref => ref.where("id", "==", product.id).where("validated", "==", false)).valueChanges()
  }

  //Sales
  getSales(date: { begin: Date, end: Date }): Observable<Sale[]> {
    return this.afs.collection<Sale>(this.salesRef,
      ref => ref.where("createdAt", "<=", date.end).where("createdAt", ">=", date.begin))
      .valueChanges();
  }

  onSaveSale(sale: Sale): Observable<firebase.firestore.WriteBatch> {
    let saleRef: DocumentReference = this.afs.firestore.collection(this.salesRef).doc(sale.id);
    let saleData: Sale = sale;
    let batch = this.afs.firestore.batch()

    batch.set(saleRef, saleData);
    return of(batch);
  }

  onUpdateSaleVoucher(saleId: string, voucher: boolean, user: User, photos?: Sale['voucher']): firebase.firestore.WriteBatch {
    let saleRef: DocumentReference = this.afs.firestore.collection(this.salesRef).doc(saleId);
    let batch = this.afs.firestore.batch();
    if (photos) {
      if (photos.length) {
        batch.update(saleRef, {
          voucherActionAt: new Date(),
          voucherActionBy: user,
          voucherChecked: voucher,
          voucher: photos,
          editedAt: new Date(),
          editedBy: user
        })
      }
    } else {
      batch.update(saleRef, { voucherActionAt: new Date(), voucherActionBy: user, voucherChecked: voucher })
    }
    return batch
  }

  onUpdateStock(requestedProducts: Sale['requestedProducts'],
    batch: firebase.firestore.WriteBatch, decrease: boolean) {

    let dec = decrease ? -1 : 1;
    let requestedProductRef: DocumentReference;

    requestedProducts.forEach(product => {
      if (!product.product.package) {
        requestedProductRef = this.afs.firestore.collection(this.productsListRef).doc(product.product.id)
        batch.update(requestedProductRef, { realStock: firebase.firestore.FieldValue.increment(dec * product.quantity) });
      } else {
        product.chosenOptions.forEach(opt => {
          requestedProductRef = this.afs.firestore.collection(this.productsListRef).doc(opt.id)
          batch.update(requestedProductRef, { realStock: firebase.firestore.FieldValue.increment(dec * product.quantity) });
        })
      }
    })

    return batch;
  }

  //configuracion
  getDistricts(): Observable<any> {
    return this.afs.collection(`/db/24multiservicios/config`).doc('generalConfig').valueChanges()
      .pipe(
        map(res => res['districts']),
        map(res => {
          return res.sort((a, b) => {
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
        }),
        shareReplay(1)
      )
  }

  getPayments(): Observable<any> {
    return this.afs.collection(`/db/24multiservicios/config`).doc('generalConfig').valueChanges()
      .pipe(
        map(res => res['payments']),
        map(res => {
          return res.sort((a, b) => {
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
        }),
        shareReplay(1)
      )
  }

  getConfiUsers(): Observable<User[]> {
    return this.afs.collection<User>(`/users`, ref => ref.where("role", '>=', ''))
      .valueChanges().pipe(
        shareReplay(1)
      );
  }

  // STORE SALES
  //Sales
  getStoreSales(date: { begin: Date, end: Date }): Observable<StoreSale[]> {
    return this.afs.collection<StoreSale>(this.storeSalesRef,
      ref => ref.where("createdAt", "<=", date.end).where("createdAt", ">=", date.begin).orderBy("createdAt", 'desc'))
      .valueChanges();
  }

  getUserTickets(uid: string): Observable<Array<Ticket>> {
    return this.afs.collection<Ticket>(`/users/${uid}/tickets`, ref => ref.orderBy("index")).valueChanges()
  }

  // PRODUCT LIST ENTRIES
  getProduct(id: string): Observable<Product> {
    return this.afs.doc<Product>(`${this.productsListRef}/${id}`)
      .valueChanges().pipe(shareReplay(1));
  }
}
