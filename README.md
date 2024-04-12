# Embedded QuickSight Example

This example demonstrates embedding a QuickSight dashboard in a static S3 website.  Okta is used for authentication and tag-based row-level security (RLS) for restricting data access.

[Reference](https://docs.aws.amazon.com/quicksight/latest/user/quicksight-dev-rls-tags.html)

## Install

Follow [instructions](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) to install CDK and bootstrap your account.

## Setup

### QuickSight
Create the QuickSight CloudFormation sample **qs/template.yaml**.

The template has been modified from its [original version](https://catalog.workshops.aws/quicksight/en-US/admin-workshop/1-prerequisites) to include tag-based row level security (RLS) for the Region and Segment columns.

### DNS
Create a public domain and hosted zone in Route 53.

Choose a subdomain. &nbsp;A DNS record and matching S3 bucket will be created in later steps.  The name must be unique, you can check if the bucket already exists with:  
```
aws s3 ls s3://<bucket name>
```

### Okta

1. Create an [Okta developer](https://developer.okta.com/signup/) account.

2. Navigate to Directory->Groups and create 2 groups.
    1. US.Startup
    2. EMEA.SMB

3. Create a user in each group

4. Navigate to Applications and select Create App Integration.
    1. Choose OIDC, Web Application, Next.
    2. Enter an app name.
    3. Choose the Authorization Code grant type.
    4. Enter the Sign-in redirect URI e.g. https://&lt;subdomain&gt;/oauth2/idpresponse
    5. Choose Limit access to selected groups
       1. Add **US.Startup**
       2. Add **EMEA.SMB**
    6. Save 
5. Copy the **Client ID and Secret** for configuration.
6. Select the Sign On tab
    1. Click Edit under OpenID Connect ID Token
    2. Set Groups claim filter to:  groups Matches regex .*
7. Select the Okta API Scopes tab
    1.  Click Grant next to okta.groups.read
8. Navigate to Security->API
    1. Open the default Authorization Server
    2. Copy **Issuer URL** for configuration.
    3. Select the Scopes tab and add the groups scope.
    4. Select the Claims tab and add the groups claim:
        *  Matches regex US.&ast;|EMEA.&ast;|APAC.*



## Config

Add the Okta client secret to SecretsManager.  This will also set the secret ARN in cdk.context.json.
```
cd scripts
./secret.sh <client secret>
```
Create a self-signed certificate and import it into ACM.  This will also set the cert ARN in cdk.context.json for offloading TLS on the ALB.
```
./ssl.sh <subdomain>
```

Configure the remaining CDK context (cdk.context.json)

```
    "app": {
      "sub": "",
      "zone": "",
      "ingress": "",
      "dashboard": "QSTCF-Dashboard",
      "idp": {
        "url": "",
        "clientId": "",
        "clientSecret": ""
      },
      "cert": ""
    }
```
| Key    | Value |
| -------- | ------- |
| zone | R53 zone name |
| sub | subdomain |
| ingress |  Your WorkSpace CIDR IP  |
| dashboard | Name of dashboard to embed  |
| idp url | Okta issurer url  |
| idp clientId | Okta app client ID  |
| idp clientSecret | Okta app client secret ARN |
| cert | ACM cert ARN |


## Deploy


Deploy the CDK stack
```
cd ..
cdk deploy
```

## Test

Open the website in your browser:

https://&lt;subdomain&gt;/site/index.html

Very that data is restricted to each user, by Region and Segment, based on their group assignments.