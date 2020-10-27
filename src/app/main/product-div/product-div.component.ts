import { Package } from "src/app/core/models/package.model";
import { Router } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";
import { DatabaseService } from "src/app/core/services/database.service";
import { Product } from "src/app/core/models/product.model";
import {
  Component,
  OnInit,
  CUSTOM_ELEMENTS_SCHEMA,
  Input,
} from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { StoreClosedDialogComponent } from "src/app/shared-dialogs/store-closed-dialog/store-closed-dialog.component";
import { Observable } from "rxjs";
import { map, switchMap, tap } from "rxjs/operators";

@Component({
  selector: "app-product-div",
  templateUrl: "./product-div.component.html",
  styleUrls: ["./product-div.component.scss"],
})
export class ProductDivComponent implements OnInit {
  @Input() package: boolean;
  @Input() id: string;
  @Input() maxWeight: number;
  @Input() buttonAdd: boolean;
  defaultImage = "../../../assets/images/24multi-vertical-logo.png";

  product$: Observable<any>;
  product: Product;

  constructor(
    public dbs: DatabaseService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    if (this.package) {
      this.product$ = this.dbs.getPackage(this.id).pipe(
        switchMap((pack) => {
          let reduce = pack["items"]
            .map((item) => item["productsOptions"].map((prd) => prd["id"]))
            .reduce((a, b) => a.concat(b), []);

          return this.dbs.getItemsPackage(reduce).pipe(
            map((items) => {

              pack["items"] = pack["items"].map((el) => {
                let options = [...el.productsOptions].map((ul) => {
                  let productOp = items
                    .filter((lo) => lo.id == ul.id)
                    .map((lu) => {
                      return this.inOrder(lu);
                    })[0];
                  if (productOp) {
                    ul["realStock"] = productOp["realStock"];
                    ul["sellMinimum"] = productOp["sellMinimum"];
                  }
                  return ul;
                });

                // let select = options.filter(lu => (lu.realStock >= lu.sellMinimum) && lu.published)[0]
                let select = options.filter(
                  (lu) => lu?.realStock >= lu?.sellMinimum
                )[0];
                return {
                  productsOptions: options,
                  choose: select,
                };
              });
              return pack;
            })
          );
        }),
        tap((res) => {

          this.product = res;
        })
      );
    } else {
      this.product$ = this.dbs.getProduct(this.id).pipe(
        tap((prod) => {
          this.product = this.inOrder(prod);
        })
      );
    }
  }

  inOrder(res) {
    let index = this.dbs.order.findIndex(
      (el) => el["product"]["id"] == res["id"]
    );
    if (index != -1) {
      res["realStock"] -= this.dbs.order[index]["quantity"];
    }
    let inPackage = this.dbs.order.filter((li) => {
      if (li.product.package) {
        return li.chosenOptions.filter((lo) => lo["id"] == res["id"]);
      } else {
        return false;
      }
    });
    if (inPackage.length) {
      res["realStock"] -= inPackage.length;
    }
    return res;
  }

  add(item) {
    if (!this.dbs.isOpen && !this.dbs.isAdmin) {
      this.dialog.open(StoreClosedDialogComponent);
      return;
    }

    if (this.package) {
      let newpackage = {
        product: item,
        quantity: 1,
        chosenOptions: item["items"].map((el) => el["choose"]),
      };
      let change = false;
      this.product["items"] = this.product["items"].map((el) => {
        el["productsOptions"] = el["productsOptions"].map((lo) => {
          if (lo["id"] == el["choose"]["id"]) {
            lo["realStock"]--;
            change = change || lo["realStock"] <= el["choose"]["sellMinimum"];
          }
          return lo;
        });

        if (change) {
          el["choose"] = el["productsOptions"].filter(
            (lu) => lu?.realStock >= lu?.sellMinimum
          )[0];
        }

        return el;
      });
      this.dbs.order.push(newpackage);
    } else {
      this.product.realStock--
      let index = this.dbs.order.findIndex(
        (el) => el["product"]["id"] == item["id"]
      );

      if (index == -1) {
        let newproduct = {
          product: item,
          quantity: 1,
        };
        this.dbs.order.push(newproduct);
      } else {
        this.dbs.order[index]["quantity"]++;
      }
    }

    this.dbs.total = [...this.dbs.order]
      .map((el) => this.giveProductPrice(el))
      .reduce((a, b) => a + b, 0);
    this.dbs.sum.next(
      [...this.dbs.order]
        .map((el) => this.giveProductPrice(el))
        .reduce((a, b) => a + b, 0)
    );

    let stop = this.maxWeight;
    let realQuantity = this.dbs.order.map((el) => {
      if (el.product["package"]) {
        return el["chosenOptions"]
          .map((ol) => {
            return el.quantity * ol.unit.weight;
          })
          .reduce((a, b) => a + b, 0);
      } else {
        return el.quantity * el.product.unit.weight;
      }
    });

    let quantity = realQuantity.reduce((a, b) => a + b, 0);

    if (quantity >= stop) {
      this.snackBar.open(
        "🤯 Ha llegado al límite máximo de peso por pedido 🧀",
        "Aceptar",
        {
          duration: 6000,
        }
      );
    }
  }

  stopBuy(item: Product) {
    let prod = 0;
    if (item["package"]) {
      prod = item["items"]
        .map((el) => {
          return el["choose"].unit.weight;
        })
        .reduce((a, b) => a + b, 0);
    } else {
      prod = item.unit.weight;
    }

    let stop = this.maxWeight;
    let realQuantity = this.dbs.order.map((el) => {
      if (el.product["package"]) {
        return el["chosenOptions"]
          .map((ol) => {
            return el.quantity * ol.unit.weight;
          })
          .reduce((a, b) => a + b, 0);
      } else {
        return el.quantity * el.product.unit.weight;
      }
    });

    let quantity = realQuantity.reduce((a, b) => a + b, 0);

    // return stop - quantity >= prod
    return true;
  }

  giveProductPrice(item) {
    if (item.product.promo) {
      let promTotalQuantity = Math.floor(
        item.quantity / item.product.promoData.quantity
      );
      let promTotalPrice =
        promTotalQuantity * item.product.promoData.promoPrice;
      let noPromTotalQuantity = item.quantity % item.product.promoData.quantity;
      let noPromTotalPrice = noPromTotalQuantity * item.product.price;
      return Number((promTotalPrice + noPromTotalPrice).toFixed(1));
    } else {
      return Number((item.quantity * item.product.price).toFixed(1));
    }
  }

  getdiscount(item: Product) {
    let promo = item.price - item.promoData.promoPrice;
    let discount = (promo / item.price) * 100;
    return Math.round(discount);
  }

  navigate(name) {
    this.router.navigate(["/main/products/recetas", name]);
  }

  optionDisabled(product: Product): boolean {
    let stock = product.realStock <= product.sellMinimum;
    return !product.published || stock;
  }

  packageDisabled(pack): boolean {
    let disabled = pack.items.filter((el) => !el.choose);
    return disabled.length > 0;
    // return false
  }
}
