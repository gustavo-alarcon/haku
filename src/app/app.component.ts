import { Component } from '@angular/core';
import { ThemeService } from './core/services/theme.service';
import { DatabaseService } from './core/services/database.service';
import { Config } from 'protractor';
import { Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { tap } from 'rxjs/operators';
import { UpdateDialogComponent } from './shared-dialogs/update-dialog/update-dialog.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = '24multiservicios';
  version$: Observable<Config>

  constructor(
    public themeService: ThemeService,
    private dbs: DatabaseService,
    private dialog: MatDialog,
  ){}

  ngOnInit(){
    this.version$ = this.dbs.getGeneralConfigDoc().pipe(
      tap(conf => {
        if(conf.lastVersion != this.dbs.version){
          this.dialog.open(UpdateDialogComponent, {
            data: conf.lastVersion,
            disableClose: true
          })
        }
      }),
    )
  }
}
