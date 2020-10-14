import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { DatabaseService } from '../core/services/database.service';
import { map, filter, mapTo } from 'rxjs/operators';
@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  version: string

  image: string = '../../assets/images/24multi-vertical-logo.png'

  constructor(
    private dbs: DatabaseService
  ) { }

  ngOnInit(): void {
    this.version = this.dbs.version
  }

}
