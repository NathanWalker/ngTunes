import {Injectable} from '@angular/core';

@Injectable()
export class WindowService {
  
  public navigator: any = {};
  public location: any = {};
  public alert(msg: string): void { return; }
  public confirm(msg: string): void { return; }
  public open(url: string): void { return; }
  public innerWidth: number;
  public innerHeight: number;

}
