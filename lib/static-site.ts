import * as cdk from 'aws-cdk-lib';
import { Construct } from "constructs";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AuthOptions } from './setup/shared';

export interface SiteProps {
    path: string,
    asset: string,
    priority: number,
    bucket: s3.Bucket,
    auth: AuthOptions,
    listener: elb.ApplicationListener,
    targetGroup: elb.ApplicationTargetGroup
}

export class StaticSite extends Construct {
    constructor(scope: Construct, id: string, private props: SiteProps) {
        super(scope, id);

        new deploy.BucketDeployment(this, 'Deploy', {
            destinationBucket: props.bucket,
            sources: [deploy.Source.asset(props.asset)]
        });
        
        props.listener.addAction(`Site-${props.priority}`, {
            priority: props.priority,
            action: elb.ListenerAction.authenticateOidc({
                ...props.auth,
                next: elb.ListenerAction.forward([props.targetGroup])
            }),
            conditions: [ elb.ListenerCondition.pathPatterns([props.path]) ]
        });
    }
}
