import { Product } from 'src/app/core/models/product.model';
import { Unit } from 'src/app/core/models/unit.model';
import { DatabaseService } from 'src/app/core/services/database.service';
import { Observable } from 'rxjs';
import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-shopping-cart',
  templateUrl: './shopping-cart.component.html',
  styleUrls: ['./shopping-cart.component.scss']
})
export class ShoppingCartComponent implements OnInit {

  @Input() delivery: number = 6
  @Input() order: {
    product: Product,
    quantity: number
  }[] = []
  @Input() modified: boolean


  delivery$: Observable<number>
  total: number = 0

  constructor(
    public dbs: DatabaseService
  ) { }

  ngOnInit(): void {
    console.log(this.order);
    
    this.total = this.order.map(el => this.giveProductPrice(el)).reduce((a, b) => a + b, 0)
    
  }

  getUnit(quantity: number, unit: Unit) {
    if (unit.weight == 1) {
      if (quantity > 1) {
        return unit.abbreviation + 's'
      } else {
        return unit.abbreviation
      }
    } else {
      return '(' + unit.description + ')'
    }
  }

  roundNumber(number) {
    return Number(parseFloat(number).toFixed(1));
  }

  round(number) {
    return Math.floor(number)
  }

  giveProductPrice(item) {
    if (item.product.promo) {
      let promTotalQuantity = Math.floor(item.quantity / item.product.promoData.quantity);
      let promTotalPrice = promTotalQuantity * item.product.promoData.promoPrice;
      let noPromTotalQuantity = item.quantity % item.product.promoData.quantity;
      let noPromTotalPrice = noPromTotalQuantity * item.product.price;
      return this.roundNumber(promTotalPrice + noPromTotalPrice);
    }
    else {
      return this.roundNumber(item.quantity * item.product.price)
    }
  }

  delete(ind) {
    this.order.splice(ind, 1)
    this.total = this.order.map(el => this.giveProductPrice(el)).reduce((a, b) => a + b, 0)
    this.dbs.sum.next(this.total)
    if (this.order.length == 0) {
      this.dbs.view.next(1)
      this.dbs.total = this.total
      localStorage.clear()
    }


  }


}
