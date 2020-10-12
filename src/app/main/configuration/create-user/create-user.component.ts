import { User } from 'src/app/core/models/user.model';
import { AngularFirestore, DocumentReference } from '@angular/fire/firestore';
import { take, map } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatabaseService } from 'src/app/core/services/database.service';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Observable, BehaviorSubject } from 'rxjs';
import { FormGroup, FormBuilder, Validators, AbstractControl, FormControl } from '@angular/forms';
import { Component, OnInit, Inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
@Component({
  selector: 'app-create-user',
  templateUrl: './create-user.component.html',
  styleUrls: ['./create-user.component.scss']
})
export class CreateUserComponent implements OnInit {

  loading = new BehaviorSubject<boolean>(false)
  loading$ = this.loading.asObservable()

  userForm: FormGroup

  permits: Array<string> = ['Administrador', 'Vendedora', 'Logística', 'Contabilidad']

  hidePass: boolean = true;

  httpOptions;

  constructor(
    private dialogRef: MatDialogRef<CreateUserComponent>,
    private fb: FormBuilder,
    private dbs: DatabaseService,
    private snackBar: MatSnackBar,
    private afs: AngularFirestore,
    private http: HttpClient,
    @Inject(MAT_DIALOG_DATA) public data: { item: User, edit: boolean }
  ) {

    this.httpOptions = {
      headers: new HttpHeaders({
        'Content-type': 'application/form-data'
      })
    };
  }

  ngOnInit(): void {
    if (this.data.edit) {
      this.userForm = this.fb.group({
        email: [this.data.item.email, [Validators.required, Validators.email], [this.emailRepeatedValidator()]],
        name: [this.data.item.name, Validators.required],
        lastname: [this.data.item.lastName1, Validators.required],
        permits: [this.data.item.role, Validators.required]
      })

      this.userForm.get('email').disable()
    } else {
      this.userForm = this.fb.group({
        email: [null, [Validators.required, Validators.email], [this.emailRepeatedValidator()]],
        pass: [null, [Validators.required, Validators.minLength(6)]],
        name: [null, Validators.required],
        lastname: [null, Validators.required],
        permits: [null, Validators.required]
      })
    }


  }

  save() {
    this.userForm.markAsPending();
    this.userForm.disable()
    this.loading.next(true)

    if (this.data.edit) {
      this.edit()
    } else {
      this.create()
    }

  }

  showSelectedUser(staff): string | undefined {
    return staff ? staff['email'] : undefined;
  }

  emailRepeatedValidator() {
    return (control: AbstractControl) => {
      const value = control.value.toLowerCase();
      return this.dbs.getUsersStatic().pipe(
        map(res => {

          return res.find(el => el.email.toLowerCase() == value) ? { emailRepeatedValidator: true } : null
        }))
    }
  }

  edit() {
    const ref: DocumentReference = this.afs.firestore.collection(`users`).doc(this.data.item.uid);
    const batch = this.afs.firestore.batch();
    let updateData = {
      completeName: this.userForm.value['name'].split(" ", 1)[0] + ' ' + this.userForm.value['lastname'].split(" ", 1)[0],
      name: this.userForm.get('name').value,
      lastName1: this.userForm.get('lastname').value,
      role: this.userForm.get('permits').value,
      seller: this.userForm.get('permits').value == 'Vendedora',
      logistic: this.userForm.get('permits').value == 'Logística',
      accountant: this.userForm.get('permits').value == 'Contabilidad',
      admin: this.userForm.get('permits').value == 'Administrador'
    }

    batch.update(ref, updateData)

    batch.commit()
      .then(() => {
        this.loading.next(false)
        this.dialogRef.close();
        this.snackBar.open("Usuario editado!", "Cerrar");
      })
      .catch(err => {
        console.log(err);
        this.snackBar.open("Ups! parece que hubo un error ...", "Cerrar");
      })
  }

  create(): void {
    this.userForm.markAsPending()
    this.userForm.disable()
    this.loading.next(true)

    this.http.post(`https://us-central1-24multiservicios.cloudfunctions.net/msCreateUser/?email=${this.userForm.value['email']}&displayName=${this.userForm.value['name'].split(" ", 1)[0] + ', ' + this.userForm.value['lastname'].split(" ", 1)[0]}&password=${this.userForm.value['pass']}`
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
          const ref: DocumentReference = this.afs.firestore.collection(`users`).doc(res['uid']);
          const batch = this.afs.firestore.batch();

          let updateData = {
            completeName: this.userForm.value['name'].split(" ", 1)[0] + ' ' + this.userForm.value['lastname'].split(" ", 1)[0],
            name: this.userForm.get('name').value,
            lastName1: this.userForm.get('lastname').value,
            email: this.userForm.get('email').value,
            password: this.userForm.get('pass').value,
            role: this.userForm.get('permits').value,
            seller: this.userForm.get('permits').value == 'Vendedora',
            logistic: this.userForm.get('permits').value == 'Logística',
            accountant: this.userForm.get('permits').value == 'Contabilidad',
            admin: this.userForm.get('permits').value == 'Administrador',
            uid: res['uid'],
            createdAt: new Date(),
          }

          batch.set(ref, updateData)

          batch.commit()
            .then(() => {
              this.loading.next(false)
              this.dialogRef.close();
              this.snackBar.open("Usuario creado!", "Cerrar");
            })
            .catch(err => {
              console.log(err);
              this.snackBar.open("Ups! parece que hubo un error ...", "Cerrar");
            })
        }

      })
  }

}
