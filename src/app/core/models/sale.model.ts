import { User } from 'src/app/core/models/user.model';
import { Product } from './product.model';
import { Package, PackageItems } from './package.model';

export class saleStatusOptions {
  requested = 'Solicitado';
  attended = 'Atendido';
  confirmedRequest = 'Solicitud Confirmada';        //can be confirmed only when voucher is valid
  confirmedDocument = 'Comprobante Confirmado';
  // confirmedDelivery = 'Delivery Confirmado';
  // driverAssigned = 'Conductor Asignado';
  finished = 'Entregado';
  cancelled = 'Anulado'
}

type FilterFlags<Base, Condition, Data> =
  Base extends Condition ? Data : never
  ;

export interface SaleRequestedProducts {
  product: Product | Package;
  quantity: number;               
  //If "product" is a package, we will have to specify the chosen products
  //for each field in package.items. chosenOptions will contain the
  //chosen products in the same order as each field in package.items.
  chosenOptions?: PackageItems["productsOptions"][0][];
}

export interface Sale {
  id: string;
  correlative: number;
  correlativeType: string;
  payType?: string | {
    account: string;
    image: string;
    name: string;
  },
  document?: string,             //tipo de comprobante
  location: {
    address: string,
    district: any,
    coord?: {
      lat: number,
      lng: number,
    },
    reference: string,
    phone: number
  },

  userId?: string;
  user: User;                   //requesting user
  requestDate: Date,            //Fecha deseada por cliente

  //A partir de este punto, todo varia de acuerdo
  //a formulario de ventas.
  status: saleStatusOptions[keyof saleStatusOptions]

  requestedProducts: SaleRequestedProducts[];     
  

  deliveryPrice: number;
  total: number;

  voucher: {
    voucherPhoto: string,
    voucherPath: string
  }[]

  voucherChecked: boolean,      //done by admin. needed to confirmedDelivery
  voucherActionBy?: User,
  voucherActionAt?: Date,

  attendedData?: {             //Can go only when Atendido or more
    attendedBy: User,
    attendedAt: Date,
  }

  confirmedRequestData?: {        //only when confirmedRequest or more
    assignedDate: Date,           //Fecha asignada por admin
    requestedProductsId: string[];//Used in virtual stock
    observation: string,

    confirmedBy: User,
    confirmedAt: Date,
  }

  confirmedDocumentData?: {    //This refers to when we give
    documentNumber: string,   //the n° comprobante

    confirmedBy: User,
    confirmedAt: Date,
  }

  confirmedDeliveryData?: {           //To confirme delivery data we need
    deliveryType: "Biker" | "Moto",   //to have the vouchers checked
    deliveryBusiness: any,

    confirmedBy: User,
    confirmedAt: Date
  }

  cancelledData?: {
    cancelledAt: Date,
    cancelledBy: User,
  }

  driverAssignedData?: {
    assignedAt: Date,
    assignedBy: User,
    observation: string,

    assignedDriver: any,
  }

  finishedData?: {
    finishedAt: Date,
    finishedBy: User,
    observation: string
  }

  createdAt: Date,
  createdBy: User,

  editedAt?: Date,
  editedBy?: User
}