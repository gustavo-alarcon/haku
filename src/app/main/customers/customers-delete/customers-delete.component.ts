import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { User } from 'src/app/core/models/user.model';
import { BehaviorSubject } from 'rxjs';
import { AngularFirestore, DocumentReference } from '@angular/fire/firestore';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-customers-delete',
  templateUrl: './customers-delete.component.html',
  styleUrls: ['./customers-delete.component.scss']
})
export class CustomersDeleteComponent implements OnInit {

  loading = new BehaviorSubject<boolean>(false)
  loading$ = this.loading.asObservable()

  httpOptions;

  constructor(
    private dialogRef: MatDialogRef<CustomersDeleteComponent>,
    private snackBar: MatSnackBar,
    private afs: AngularFirestore,
    private http: HttpClient,
    @Inject(MAT_DIALOG_DATA) public data: User
  ) {
    this.httpOptions = {
      headers: new HttpHeaders({
        'Content-type': 'application/form-data'
      })
    };
  }

  ngOnInit(): void {
  }

  delete(): void {
    this.loading.next(true)
    console.log(this.data.uid);
    
    this.http.post(`https://us-central1-24multiservicios.cloudfunctions.net/msDeleteUser?uid=${this.data.uid}`
      , this.data
      , this.httpOptions)
      .pipe(
        take(1)
      )
      .subscribe(res => {
        if (res['result'] === "ERROR") {
          switch (res['code']) {
            case "auth/email-already-exists":
              this.snackBar.open("Error: Este correo ya existe", "Cerrar", {
                duration: 6000
              });
              this.loading.next(false)
              break;

            default:
              break;
          }
        }

        if (res['result'] === "OK") {
          const ref: DocumentReference = this.afs.firestore.collection(`users`).doc(this.data.uid);
          const batch = this.afs.firestore.batch();

          batch.delete(ref)

          batch.commit()
            .then(() => {
              this.loading.next(false)
              this.dialogRef.close();
            })
            .catch(err => {
              console.log(err);
              this.snackBar.open("Ups! parece que hubo un error ...", "Cerrar");
            })
        }

      })

  }

}
