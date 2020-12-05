import { AuthService } from './core/services/auth.service';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

//Firebase
import { AngularFireModule } from '@angular/fire';
import { AngularFirestoreModule } from '@angular/fire/firestore';
import { AngularFireStorageModule } from '@angular/fire/storage';
import { AngularFireAuthModule } from '@angular/fire/auth';
import { environment } from 'src/environments/environment';

//dep
import {LazyLoadImageModule} from 'ng-lazyload-image';

//Components
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './login/login.component';

//Material
import {MatSnackBarModule, MAT_SNACK_BAR_DEFAULT_OPTIONS} from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DATE_LOCALE as MAT_DATE_LOCALESAT } from 'saturn-datepicker';
import { MAT_DATE_LOCALE } from '@angular/material/core';

import { DatePipe } from '@angular/common';
import { DatabaseService } from './core/services/database.service';
import { AuthGuard } from './core/auth.guard';
import { OpeningGuard } from './core/opening.guard';
import { UpdateDialogComponent } from './shared-dialogs/update-dialog/update-dialog.component';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { StoreClosedDialogComponent } from './shared-dialogs/store-closed-dialog/store-closed-dialog.component';
import { LocalStorageModule } from 'angular-2-local-storage';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    UpdateDialogComponent,
    StoreClosedDialogComponent,
    StoreClosedDialogComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    AngularFireModule.initializeApp(environment.firebaseConfig, "haku"),
    AngularFirestoreModule,
    AngularFireAuthModule,
    AngularFireStorageModule,
    LazyLoadImageModule,
    MatSnackBarModule,
    MatButtonModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    LocalStorageModule.forRoot({
      prefix: 'haku',
      storageType: 'localStorage'
    })
  ],
  providers: [
    AuthService,
    DatabaseService,
    AuthGuard,
    OpeningGuard,
    DatePipe,
    { provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: { duration: 5000 } },
    { provide: MAT_DATE_LOCALE, useValue: 'en-GB'},
    { provide: MAT_DATE_LOCALESAT, useValue: 'en-GB'}
  ],
  entryComponents: [
    UpdateDialogComponent
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
