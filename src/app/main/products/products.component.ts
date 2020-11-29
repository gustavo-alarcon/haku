import { ActivatedRoute, Router } from '@angular/router';
import { User } from 'src/app/core/models/user.model';
import { AuthService } from 'src/app/core/services/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { map, startWith, filter, tap } from 'rxjs/operators';
import { FormControl } from '@angular/forms';
import { DatabaseService } from 'src/app/core/services/database.service';
import { Observable, combineLatest } from 'rxjs';
import { Component, OnInit} from '@angular/core';
import { Product } from 'src/app/core/models/product.model';
import { LoginDialogComponent } from '../login-dialog/login-dialog.component';
@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss']
})
export class ProductsComponent implements OnInit {
  firstSale: boolean = false

  products$: Observable<any>
  init$: Observable<User>
  categoryList$: Observable<any[]>

  name: string = ''
  maxWeight: number = 3
  total$: Observable<number>

  searchForm: FormControl = new FormControl('')

  defaultImage = "../../../assets/images/haku-lazy-image.png";

  user:User = null


  p: number = 1;
  constructor(
    public dbs: DatabaseService,
    private dialog: MatDialog,
    public auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.dbs.delivery = 6

    this.categoryList$ = combineLatest(
      this.route.fragment, this.dbs.getProductsListCategoriesValueChanges()).pipe(
        map(([route, categories]) => {
          let array = [...categories].map(el => {
            return {
              name: el.name,
              select: el.name == route
            }
          })
          return array
        })
      )

    this.products$ = combineLatest(
      this.route.fragment,
      this.dbs.getProductsList(),
      this.dbs.getPackagesList(),
      this.searchForm.valueChanges.pipe(
        filter(input => input !== null),
        startWith<any>(''),
        map(value => value.toLowerCase())
      )
    ).pipe(
      map(([route, products, packages, search]) => {
        let publish = products.filter(el => route ? el.category == route : true).filter(el => el.published)
        let packPublish = [...packages].filter(el => el.published).filter(el => route ? el.category == route : true)

        let any = [].concat(packPublish, publish)
        if (this.dbs.order.length == 0 && localStorage.getItem('order') && localStorage.getItem('dbsorder')) {
          let guardado = localStorage.getItem('dbsorder')
          let neworder = JSON.parse(guardado)
          this.dbs.order = neworder
          if (this.dbs.order.length) {
            this.dbs.view.next(2)
            this.dbs.total = this.dbs.order.map(el => this.giveProductPrice(el)).reduce((a, b) => a + b, 0)
            this.dbs.sum.next(this.dbs.total)
          }

        }

        return any.filter(el => search ? el.description.toLowerCase().includes(search) : true)
      })
    )

    this.init$ = combineLatest(
      this.auth.user$,
      this.dbs.getGeneralConfigDoc()
    ).pipe(
      map(([user, confi]) => {
        this.maxWeight = confi['maxWeight']
        if (user) {
          return user
        } else {
          return null
        }
      }),
      tap(res => {
        if (res) {
          this.user = res
          if (res['salesCount']) {
            this.firstSale = false
          } else {
            this.firstSale = true
          }

          if (res['contact']) {
            this.name = res.name.split(' ')[0]
            this.dbs.delivery = res.contact.district.delivery
          } else {
            this.dbs.delivery = 6
          }
        }
      })
    )

    this.dbs.total = this.dbs.order.map(el => this.giveProductPrice(el)).reduce((a, b) => a + b, 0)


  }



  getdiscount(item: Product) {
    let promo = item.price - item.promoData.promoPrice
    let discount = (promo / item.price) * 100
    return Math.round(discount)
  }

  login() {
    this.dialog.open(LoginDialogComponent)
    localStorage.setItem('order', 'true')
    localStorage.setItem('length', this.dbs.order.length.toString())
    this.dbs.order.forEach((el, i) => {
      localStorage.setItem('order' + i, el.product.id)
      localStorage.setItem('order' + i + 'q', el.quantity.toString())
      if (el['chosenOptions']) {
        let chosen = ''
        let limit = el['chosenOptions'].length
        el['chosenOptions'].forEach((ol, e) => {
          if (e == limit - 1) {
            chosen += ol.id
          } else {
            chosen += ol.id + ','
          }
        })
        localStorage.setItem('order' + i + 'chosen', chosen)

      }
    })
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

  shoppingCart() {
    this.dbs.view.next(2)
  }

  back(route) {
    if (route) {
      this.router.navigate(['/main']);
    }
    this.dbs.view.next(1)
    this.p = 1
    this.dbs.total = this.dbs.order.map(el => this.giveProductPrice(el)).reduce((a, b) => a + b, 0)
  }

  finish() {
    this.dbs.view.next(3)
    this.p = 1
    localStorage.clear()
  }


  navigate(name) {
    this.router.navigate(['/main/products'], { fragment: name });
  }

}
