import { AuthService } from 'src/app/core/services/auth.service';
import { Component, OnInit } from '@angular/core';
import { ThemeService } from '../core/services/theme.service';
import { MatDialog } from '@angular/material/dialog';
import { LoginDialogComponent } from './login-dialog/login-dialog.component';
import { Observable } from 'rxjs';
import { DatabaseService } from '../core/services/database.service';
import { mapTo, take, tap } from 'rxjs/operators';
import { Router, ActivatedRoute } from '@angular/router';
import { SaleDialogComponent } from './products/sale-dialog/sale-dialog.component';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit {
  version: string

  openedMenu: boolean = false;

  sub: any;
  title$: Observable<string>;
  title: string ;

  constructor(
    public auth: AuthService,
    public themeService: ThemeService,
    private dialog: MatDialog,
    private dbs: DatabaseService,
    public route: Router
  ) {

  }

  ngOnInit(): void {
    this.version = this.dbs.version;

    this.dbs.changeTitle('Categorias')

    this.dbs.currentTitle$.subscribe(res => {
      console.log(res);
      this.title = res
    });
  }

  ngOnDestroy() {
    // this.sub.unsubscribe();
  }

  toggleSideMenu(): void {
    this.openedMenu = !this.openedMenu;
  }

  login() {
    this.dialog.open(LoginDialogComponent)
  }

  logout() {
    this.auth.logout();
  }

}
