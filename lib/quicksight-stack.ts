import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { Api } from './api';
import { Net } from './setup/net';
import { Shared } from './setup/shared';
import { StaticSite } from './static-site';

export interface IContext {
  idp: any,
  sub: string,
  zone: string,
  cert: string,
  secret: string,
  ingress: string,
  dashboard: string
}

export class QuickSightStack extends cdk.Stack {
  private net: Net;
  private ctx: IContext;
  private shared: Shared;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // create prereqs
    this.setup();

    // add lambda api to lb
    new Api(this, 'Api', {
      path: '/api',
      priority: 5,
      idp: this.ctx.idp.url,
      auth: this.shared.auth,
      dashboard: this.ctx.dashboard,
      listener: this.shared.listener
    });

    // set api url in the site
    const fqdn = `${this.ctx.sub}.${this.ctx.zone}`;
    const api = `const api = 'https://${fqdn}/api';`;
    fs.writeFileSync(path.join(__dirname, '../dist/site', 'config.js'), api);

    // add static sites to lb
    new StaticSite(this, 'Site', {
      path: '/site*',
      asset: './dist',
      priority: 10,
      auth: this.shared.auth,
      bucket: this.shared.bucket,
      listener: this.shared.listener,
      targetGroup: this.shared.targetGroup
    });
  }

  private setup() {
    this.ctx = <IContext>this
      .node.tryGetContext('app');

    // create platform resources
    this.net = new Net(this, 'Net', this.ctx.zone);
    
    // create shared app resources
    this.shared = new Shared(this, 'Shared', {
      idp: this.ctx.idp,
      vpc: this.net.vpc,
      sub: this.ctx.sub,
      zone: this.net.zone,
      cert: this.ctx.cert,
      s3Ep: this.net.s3Ep,
      ingress: this.ctx.ingress
    });
  }
}