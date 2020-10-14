import { Router } from '@angular/router';
import { map, tap } from 'rxjs/operators';
import { DatabaseService } from 'src/app/core/services/database.service';
import { Observable, BehaviorSubject } from 'rxjs';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.scss']
})
export class CategoriesComponent implements OnInit {

  categories$: Observable<object[]>

  loadingCategories = new BehaviorSubject<boolean>(true);
  loadingCategories$ = this.loadingCategories.asObservable();

  defaultImage = "../../../assets/images/24multi-round-text-logo.png";

  constructor(
    private router: Router,
    public dbs: DatabaseService
  ) { }

  ngOnInit(): void {
    //Categories
    this.categories$ = this.dbs.getProductsListCategoriesValueChanges().pipe(
      map(categories=>{
        return categories.sort((a, b) => a['index'] - b['index'])
      }),
      tap(() => {
        this.loadingCategories.next(false)
      })
    )
  }

  navigate(name) {
    this.router.navigate(['/main/products'], { fragment: name });
  }

  shoppingCart() {
    this.router.navigate(['/main/products']);
    this.dbs.view.next(2)
  
  }
}
