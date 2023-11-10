import "sst/node/config";
declare module "sst/node/config" {
  export interface ConfigTypes {
    APP: string;
    STAGE: string;
  }
}

import "sst/node/table";
declare module "sst/node/table" {
  export interface TableResources {
    "Connections": {
      tableName: string;
    }
  }
}

import "sst/node/function";
declare module "sst/node/function" {
  export interface FunctionResources {
    "MyFunction": {
      functionName: string;
    }
  }
}

import "sst/node/websocket-api";
declare module "sst/node/websocket-api" {
  export interface WebSocketApiResources {
    "Api": {
      url: string;
      httpsUrl: string;
    }
  }
}

