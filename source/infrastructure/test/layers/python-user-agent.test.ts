// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Capture, Match, Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodeUserAgentLayer } from '../../lib/layers/node-user-agent';
import { PythonUserAgentLayer } from '../../lib/layers/python-user-agent';
import * as util from '../../lib/utils/common-utils';
import {
    COMMERCIAL_REGION_LAMBDA_JAVA_RUNTIME,
    COMMERCIAL_REGION_LAMBDA_NODE_RUNTIME,
    COMMERCIAL_REGION_LAMBDA_PYTHON_RUNTIME,
    GOV_CLOUD_REGION_LAMBDA_NODE_RUNTIME,
    GOV_CLOUD_REGION_LAMBDA_PYTHON_RUNTIME
} from '../../lib/utils/constants';

describe('When python user agent config layer is injected as an aspect', () => {
    let template: Template;

    beforeAll(() => {
        template = Template.fromStack(buildStack());
    });

    it('should package the lambda layer', () => {
        const layerCapture = new Capture();
        template.resourceCountIs('AWS::Lambda::LayerVersion', 1);
        template.hasResourceProperties('AWS::Lambda::LayerVersion', {
            CompatibleRuntimes: [
                GOV_CLOUD_REGION_LAMBDA_PYTHON_RUNTIME.name,
                COMMERCIAL_REGION_LAMBDA_PYTHON_RUNTIME.name
            ],
            Content: Match.anyValue(),
            Description: 'This layer configures AWS Python SDK initialization to send user-agent information'
        });

        template.resourceCountIs('AWS::Lambda::Function', 1);
        template.hasResourceProperties('AWS::Lambda::Function', {
            Layers: [
                {
                    'Ref': layerCapture
                }
            ]
        });

        expect(template.toJSON()['Resources'][layerCapture.asString()]['Type']).toEqual('AWS::Lambda::LayerVersion');
    });
});

describe('When local build fails', () => {
    let template: Template;
    beforeAll(() => {
        jest.spyOn(util, 'copyFilesSyncRecursively').mockImplementation(() => {
            throw new Error('Fake error to fail local build');
        });

        template = Template.fromStack(buildStack());
    });

    it('should use docker image to build assets when local build fails', () => {
        template.resourceCountIs('AWS::Lambda::LayerVersion', 1);
        template.hasResourceProperties('AWS::Lambda::LayerVersion', {
            CompatibleRuntimes: [
                GOV_CLOUD_REGION_LAMBDA_PYTHON_RUNTIME.name,
                COMMERCIAL_REGION_LAMBDA_PYTHON_RUNTIME.name
            ],
            Content: Match.anyValue(),
            Description: 'This layer configures AWS Python SDK initialization to send user-agent information'
        });
    });

    afterAll(() => {
        jest.clearAllMocks();
    });
});

describe('When a non-supported runtime is provided', () => {
    it('should throw an error if the runtime is Java', () => {
        try {
            const stack = new cdk.Stack();
            new lambda.Function(stack, 'TestFunction', {
                code: lambda.Code.fromAsset('../infrastructure/test/mock-lambda-func/java-lambda'),
                runtime: COMMERCIAL_REGION_LAMBDA_JAVA_RUNTIME,
                handler: 'function.handler',
                layers: [
                    new NodeUserAgentLayer(stack, 'AWSUserAgentConfigLayer', {
                        entry: '../lambda/layers/aws-node-user-agent-config',
                        description:
                            'This layer configures AWS Python SDK initialization to send user-agent information'
                    })
                ]
            });
        } catch (error) {
            expect((error as Error).message).toEqual(
                `This lambda function uses a runtime that is incompatible with this layer (${COMMERCIAL_REGION_LAMBDA_JAVA_RUNTIME.name} is not in [${GOV_CLOUD_REGION_LAMBDA_NODE_RUNTIME.name}, ${COMMERCIAL_REGION_LAMBDA_NODE_RUNTIME.name}])`
            );
        }
    });

    it('should throw an error if the runtime is a non-supported python version', () => {
        try {
            const stack = new cdk.Stack();
            new lambda.Function(stack, 'TestFunction', {
                code: lambda.Code.fromAsset('../infrastructure/test/mock-lambda-func/python-lambda'),
                runtime: lambda.Runtime.PYTHON_3_7,
                handler: 'index.handler',
                layers: [
                    new PythonUserAgentLayer(stack, 'AWSUserAgentConfigLayer', {
                        entry: '../lambda/layers/aws_boto3',
                        description:
                            'This layer configures AWS Python SDK initialization to send user-agent information'
                    })
                ]
            });
        } catch (error) {
            expect((error as Error).message).toEqual(
                'This lambda function uses a runtime that is incompatible with this layer (python3.7 is not in [python3.11, python3.12])'
            );
        }
    });
});

function buildStack(): cdk.Stack {
    const stack = new cdk.Stack();
    new lambda.Function(stack, 'TestFunction', {
        code: lambda.Code.fromAsset('../infrastructure/test/mock-lambda-func/python-lambda'),
        runtime: COMMERCIAL_REGION_LAMBDA_PYTHON_RUNTIME,
        handler: 'function.handler',
        layers: [
            new PythonUserAgentLayer(stack, 'AWSUserAgentConfigLayer', {
                entry: '../lambda/layers/custom_boto3_init',
                description: 'This layer configures AWS Python SDK initialization to send user-agent information',
                compatibleRuntimes: [GOV_CLOUD_REGION_LAMBDA_PYTHON_RUNTIME, COMMERCIAL_REGION_LAMBDA_PYTHON_RUNTIME]
            })
        ]
    });

    return stack;
}
