import {Injectable, Inject, forwardRef} from '@angular/core';
import {WindowService} from './window.service';

@Injectable()
export class LocalStorageService {

  constructor(@Inject(forwardRef(() => WindowService)) private win: WindowService) {
    
  }
  
  public setItem(key: string, data: any): void { 
    if (this.win.localStorage) {
      this.win.localStorage.setItem(key, JSON.stringify(data));
    }
  }

  public getItem(key: string): any {
    if (this.win.localStorage) {
      let value = this.win.localStorage.getItem(key);
      if (value) {
        return JSON.parse(value);
      } else {
        return null;
      }
    }
  }
}
