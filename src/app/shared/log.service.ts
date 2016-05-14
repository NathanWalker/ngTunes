import {Injectable} from '@angular/core';

@Injectable()
export class LogService {
  
  public debug(msg: any) { 
    console.log(msg);
  }

  public error(err: any) {
    console.error(err);
  }
}
