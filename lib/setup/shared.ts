import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as r53 from 'aws-cdk-lib/aws-route53';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbTgt from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';

export interface SharedProps {
    idp: any,
    vpc: ec2.IVpc,
    cert: string,
    sub: string,
    zone: r53.IHostedZone,
    ingress: string,
    s3Ep: ec2.InterfaceVpcEndpoint
}

export type AuthOptions = Omit<elb.AuthenticateOidcOptions, 'next'>;

export class Shared extends Construct {
    readonly auth: AuthOptions;
    readonly bucket: s3.Bucket;
    readonly lb: elb.ApplicationLoadBalancer;
    readonly listener: elb.ApplicationListener;
    readonly targetGroup: elb.ApplicationTargetGroup;

    constructor(scope: Construct, id: string, private props: SharedProps) {
        super(scope, id);
        this.lb = this.createLb();
        this.auth = this.authOpts();
        this.bucket = this.createBucket();
        this.listener = this.createListener();
        this.targetGroup = this.createTgtGrp();
        this.createRecord();
    }

    private createListener() {
        // self-signed cert, see /ssl
        const cert = elb
            .ListenerCertificate
            .fromArn(this.props.cert);

        return new elb.ApplicationListener(this, 'Listener', {            
            port: 443,
            certificates: [cert],
            loadBalancer: this.lb,
            defaultAction: elb.ListenerAction.fixedResponse(404)
        });
    }

    private authOpts() {
        const idp = this.props.idp;
        const iss = `${idp.url}/oauth2/default`;
        const secret = secrets.Secret
            .fromSecretCompleteArn(this, 'Secret', idp.clientSecret)
            .secretValue;
            
        const opts: AuthOptions = {
            scope: 'openid groups',
            clientId: idp.clientId,
            clientSecret: secret,
            issuer: iss,
            tokenEndpoint: `${iss}/v1/token`,
            userInfoEndpoint: `${iss}/v1/userinfo`,
            authorizationEndpoint: `${iss}/v1/authorize`
        };

        return opts;
    }

    private createLb() {
        const vpc = this.props.vpc;    
        const sg = new ec2.SecurityGroup(this, 'LbSg', { vpc });
        sg.addIngressRule(ec2.Peer.ipv4(this.props.ingress), ec2.Port.allTcp());
        return new elb.ApplicationLoadBalancer(this, 'Lb', {
          vpc,
          securityGroup: sg,
          internetFacing: true
        });
    }

    private createRecord() {
        new r53.CnameRecord(this, 'Cname', {
            zone: this.props.zone,
            recordName: this.props.sub,
            domainName: this.lb.loadBalancerDnsName
        });
    }

    // website bucket
    private createBucket() {
        const zone = this.props.zone.zoneName;

        // bucket name must match subdomain
        const bkt = new s3.Bucket(this, 'Bkt', {
            autoDeleteObjects: true,
            bucketName: `${this.props.sub}.${zone}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });

        bkt.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            principals: [new iam.AnyPrincipal()],
            resources: [
                bkt.bucketArn,
                `${bkt.bucketArn}/*`
            ],
            conditions: {
              'StringEquals': {
                'aws:SourceVpce': this.props.s3Ep.vpcEndpointId
              }
            }
        }));

        return bkt;
    }

    // target group for s3 endpoints
    private createTgtGrp() {
        const ips = this.getEpIps();
        return new elb.ApplicationTargetGroup(this, 'TgtGrp', {
            vpc: this.props.vpc,
            port: 443,
            targets: [
                new elbTgt.IpTarget(ips[0]),
                new elbTgt.IpTarget(ips[1])
            ],
            healthCheck: {
                path: '/',
                port: '443',
                protocol: elb.Protocol.HTTPS,
                healthyHttpCodes: '200,307,405',
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 5,
                timeout: cdk.Duration.seconds(30),
                interval: cdk.Duration.seconds(60)      
            }
        });
    }

    private getEpIps() {
        const ep = this.props.s3Ep;
        const res = new cr.AwsCustomResource(this, 'Custom', {
            // also called for create
            onUpdate: { 
                service: 'EC2',
                action: 'describeNetworkInterfaces',
                parameters: { NetworkInterfaceIds: ep.vpcEndpointNetworkInterfaceIds },
                physicalResourceId: cr.PhysicalResourceId.of(`DecribeEni-${Date.now().toString()}`)
            },
            policy: {
                statements: [new iam.PolicyStatement({
                    actions: ['ec2:DescribeNetworkInterfaces'],
                    resources: ['*']
                })]
            }
        });
        return [
            res.getResponseField('NetworkInterfaces.0.PrivateIpAddress'),
            res.getResponseField('NetworkInterfaces.1.PrivateIpAddress')
        ];
    }
}