import { Pipe, PipeTransform } from '@angular/core';
import { PackageItems } from 'src/app/core/models/package.model';

@Pipe({
  name: 'getProductOptionFromId'
})
export class GetProductOptionFromIdPipe implements PipeTransform {

  transform(value: string, productOptions: PackageItems["productsOptions"]): PackageItems["productsOptions"][0] {
    let id= value
    return productOptions.find(el => el.id == id);
  }

}
