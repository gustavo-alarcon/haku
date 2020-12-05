import { Product } from './product.model'
import { Unit } from './unit.model'
import { User } from './user.model'

export const buysCollRef = `db/haku/buys`

export interface Buy {
  id: string;
  correlative: number;      //Should start with F
  requestedProducts: string[];    //We will contain only the id

  totalAmount: number;     //in KG
  totalPrice: number;

  //validated 
  validated: boolean;       //True only when all products are validated
  validatedDate: Date;
  status:string;

  //returned
  returned?: boolean;
  returnedQuantity?: number;
  returnedDate?: Date;
  returnedValidated?: boolean;
  returnedStatus?: string;

  requestedDate: Date;      //When the request was submitted
  requestedBy: User;
  
  
  editedDate: Date;
  editedBy: User;
}

export const buysProductsCollRef = `db/haku/buys/` + `buyId` + `/buyRequestedProducts/`
//We should include this on small documents
export interface BuyRequestedProduct {               //How many products should there be
  id: string;             //Should be same as product id
  buyId: string;          //Indicates the id of the buy request

  productDescription: string;
  unit: Unit;
  unitPrice: number;
  quantity: number;

  desiredDate: Date;      //When we want this product

  //validated
  validated: boolean;
  validationData: {       //null when it is not validated
    mermaStock: number;  //realStock = quantity - mermaStock - returned
    returned: number;
    observations: string;
  }
  validatedBy: string;
  validatedDate: Date;
  validatedStatus: string;
  validatedRecord?: any[];

  //returned
  returned?: boolean;
  returnedRecord?: any[];
  returnedQuantity?: number;
  returnedValidated?: boolean;
  returnedStatus?: string;
  returnDate?: Date;

  
  requestedDate: Date;      //When the request was submitted
  requestedBy: User
}