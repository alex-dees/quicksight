import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AuthOptions } from './setup/shared';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodefn from 'aws-cdk-lib/aws-lambda-nodejs';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbTgt from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';

export interface ApiProps {
  idp: string,
  path: string,
  priority: number,
  auth: AuthOptions,
  listener: elb.ApplicationListener,
  dashboard: string
}

export class Api extends Construct {
  constructor(scope: Construct, id: string, private props: ApiProps) {
    super(scope, id);
  
    const stack = cdk.Stack.of(this);
    
    const fn = new nodefn.NodejsFunction(this, 'Fn', {
      memorySize: 2048,
      timeout: cdk.Duration.seconds(30),
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../lambda', 'index.ts'),
      bundling: {
        externalModules: [
          '@aws-sdk/*'
        ]
      },
      environment: {
        IDP: props.idp,
        REGION: stack.region,
        ACCOUNT: stack.account,
        DASHBOARD: props.dashboard
      }
    });
  
    fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['quicksight:*'],
        effect: iam.Effect.ALLOW,
        resources: ['*']
    }));

    const tg = new elb.ApplicationTargetGroup(this, 'ApiTgtGrp', {
      targets: [new elbTgt.LambdaTarget(fn)]
    });

    props.listener.addAction('Api', {
      priority: props.priority,
      action: elb.ListenerAction.authenticateOidc({
          ...props.auth,
          next: elb.ListenerAction.forward([tg])
      }),
      conditions: [ elb.ListenerCondition.pathPatterns([props.path]) ]
    });
  }
}