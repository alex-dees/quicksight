#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { QuickSightStack } from '../lib/quicksight-stack';

const app = new cdk.App();

new QuickSightStack(app, 'QuickSightStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});