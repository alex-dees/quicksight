import { Handler } from "aws-lambda";

import { 
    QuickSightClient, 
    GenerateEmbedUrlForAnonymousUserCommand } 
from "@aws-sdk/client-quicksight";

import OktaJwtVerifier from '@okta/jwt-verifier';

const idp = process.env['IDP'];
const region = process.env['REGION']
const account = process.env['ACCOUNT'];
const dashboard = process.env['DASHBOARD'];
const arn = `arn:aws:quicksight:${region}:${account}:dashboard/${dashboard}`;

async function getClaims(headers: any) {
    const issuer = `${idp}/oauth2/default`;
    const verifier = new OktaJwtVerifier({ issuer });
    const jwt = await verifier.verifyAccessToken(headers['x-amzn-oidc-accesstoken'], 'api://default');
    return jwt.claims;
}

async function getEmbed(event: any) {
    const claims = await getClaims(event.headers);
    const groups = (<string[]>claims.groups)[0].split('.');

    const client = new QuickSightClient({ region });
    const input = {
        Namespace: 'default',
        AwsAccountId: account,
        SessionLifetimeInMinutes: 600,
        AuthorizedResourceArns: [ arn ],
        ExperienceConfiguration: {
            Dashboard: {
                InitialDashboardId: dashboard
            }
        },
        SessionTags: [
            { Key: 'region_tag',  Value: groups[0] },
            { Key: 'segment_tag', Value: groups[1] }
        ]
    };
    const command = new GenerateEmbedUrlForAnonymousUserCommand(input);
    const response = await client.send(command);
    
    // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/lambda-functions.html#respond-to-load-balancer
    return {
        statusCode: 200,
        isBase64Encoded: false,
        body: response.EmbedUrl,
        headers: { 'Content-Type': 'text/html;'}
    };
}

export const handler: Handler = async (event) => {
    try {
        switch (event.headers['action']) {
            case 'embed':
                return await getEmbed(event);
            case 'logout':
                return {
                    statusCode: 200,
                    body: `${idp}/login/signout`,
                    headers: {
                        'Content-Type': 'text/html;',
                        'Set-Cookie': 'AWSELBAuthSessionCookie-0=; Max-Age=-1'
                    }
                };
            default:
                return {
                    statusCode: 404
                };                
        }
    } catch (e) {
        console.error(e);
        throw e;
    }
}