# arg 1 = idp client secret

arn=$(aws secretsmanager create-secret \
--name idp-client-secret \
--secret-string $1 \
--query 'ARN' \
--output text)

# set secret arn in cdk.json
sed -i "s|.*clientSecret.*|      \"clientSecret\": \"$arn\"|g" ../cdk.context.json