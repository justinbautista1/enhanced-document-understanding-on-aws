// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import './DocumentView.css';

import { AppLayout, ContentLayout, StatusIndicatorProps, Tabs } from '@cloudscape-design/components';
import React, { useEffect } from 'react';
import {
    COMPREHEND_MEDICAL_SERVICE,
    COMPREHEND_SERVICE,
    EntityTypes,
    TEXTRACT_KEY_VALUE_PAIRS,
    TEXTRACT_RAW_TEXT,
    TEXTRACT_TABLES
} from '../../utils/constants';
import {
    getDocumentKeyValuePairs,
    getDocumentLines,
    getDocumentPageCount,
    getDocumentTables
} from '../../utils/document';

import { useAppSelector } from '../../store/hooks/hooks';
import {
    useLazyDocumentToDownloadQuery,
    useLazyGetDocumentByCaseAndDocumentIdQuery
} from '../../store/reducers/documentApiSlice';
import { selectDocumentProcessingResult } from '../../store/reducers/documentSlice';
import { useGetInferencesQuery } from '../../store/reducers/inferenceApiSlice';
import { DocumentResultsInfoPanelContent } from '../../utils/info-panel-contents';
import { DocResultsPageHeader } from '../DocumentTable/full-page-header';
import EntityDetectionTab from '../EntityDetectionTab';
import TextractTab from '../TextractTab';

type DocumentViewProps = {
    selectedDocumentId: string;
    selectedCaseId: string;
    selectedDocumentFileType: string;
    selectedCaseName: string;
    selectedDocumentName: string;
    textractDetectResponse: any;
    setSelectedCaseId: React.Dispatch<React.SetStateAction<string>>;
    setSelectedDocumentId: React.Dispatch<React.SetStateAction<string>>;
    setSelectedDocumentFileType: React.Dispatch<React.SetStateAction<string>>;
    setSelectedCaseName: React.Dispatch<React.SetStateAction<string>>;
    setSelectedDocumentName: React.Dispatch<React.SetStateAction<string>>;
};

export default function DocumentView(props: DocumentViewProps) {
    const [getDocumentByCaseAndDocumentId] = useLazyGetDocumentByCaseAndDocumentIdQuery();
    const [getSignedUrl] = useLazyDocumentToDownloadQuery();
    useGetInferencesQuery(
        { selectedCaseId: props.selectedCaseId, selectedDocumentId: props.selectedDocumentId },
        { skip: props.selectedCaseId === '' || props.selectedDocumentId === '' }
    );
    const [getDocumentToDownloadTrigger] = useLazyDocumentToDownloadQuery();
    const [documentUrl, setDocumentUrl] = React.useState<string>('');
    const [currentStatus, setCurrentStatus] = React.useState<StatusIndicatorProps.Type | undefined>();
    const [documentPageCount, setDocumentPageCount] = React.useState<number>(0);
    const [currentPageNumber, setCurrentPageNumber] = React.useState(1);
    const documentProcessingResults = useAppSelector(selectDocumentProcessingResult);
    console.log('documentProcessingResults', documentProcessingResults);

    const [selectedEntities, setSelectedEntities] = React.useState<any>({
        [EntityTypes.ENTITY_STANDARD]: [],
        [EntityTypes.PII]: [],
        [EntityTypes.MEDICAL_ENTITY]: []
    });
    const [previewRedaction, setPreviewRedaction] = React.useState('');
    const [toolsOpen, setToolsOpen] = React.useState(false);

    const switchPage = (newPageNumber: number) => {
        setCurrentPageNumber(newPageNumber);
    };

    const docData = React.useMemo(() => {
        const pairs = getDocumentKeyValuePairs(documentProcessingResults, 'KEY_VALUE_SET');
        const tables = getDocumentTables(documentProcessingResults, 'TABLE');
        const lines = getDocumentLines(documentProcessingResults, 'LINE');
        const standardEntities = { ...documentProcessingResults.comprehendGenericResponse } as any;

        // Build HARDCODE entity from textractDetectResponse, matching standardEntities structure
        const textract = documentProcessingResults.textractDetectResponse;
        const hardcodeEntities: any[] = [];
        standardEntities.OTHER = {
            ...(standardEntities.OTHER || {}),
            HARDCODE: hardcodeEntities
        };
        console.log('standardEntities', standardEntities);
        return {
            pairs,
            lines,
            tables,
            standardEntities,
            medicalEntities: documentProcessingResults.comprehendMedicalResponse,
            piiEntities: documentProcessingResults.comprehendPiiResponse,
            textractDetectResponse: documentProcessingResults.textractDetectResponse
        };
    }, [documentProcessingResults, props.textractDetectResponse]);

    useEffect(() => {
        props.setSelectedDocumentId(window.sessionStorage.getItem('selectedDocumentId') || '');
        props.setSelectedCaseId(window.sessionStorage.getItem('selectedCaseId') || '');
        props.setSelectedDocumentFileType(window.sessionStorage.getItem('selectedDocumentFileType') || '');
        props.setSelectedCaseName(window.sessionStorage.getItem('selectedCaseName') || '');
        props.setSelectedDocumentName(window.sessionStorage.getItem('selectedDocumentName') || '');
    }, [props]);

    const retrieveSignedUrl = async () => {
        const documentResponse = await getDocumentByCaseAndDocumentId({
            caseId: props.selectedCaseId,
            documentId: props.selectedDocumentId,
            redacted: false
        }).unwrap();

        const signedUrlObject = await getSignedUrl({ key: documentResponse.key }).unwrap();
        setDocumentUrl(signedUrlObject.downloadUrl);
    };

    useEffect(() => {
        const getDocumentData = async () => {
            setCurrentStatus('loading');
            try {
                if (props.selectedCaseId === '' || props.selectedDocumentId === '') {
                    setCurrentStatus('error');
                    return;
                }

                const documentResponse = await getDocumentByCaseAndDocumentId({
                    caseId: props.selectedCaseId,
                    documentId: props.selectedDocumentId,
                    redacted: false
                }).unwrap();

                const signedUrlObject = await getDocumentToDownloadTrigger({ key: documentResponse.key }).unwrap();
                setDocumentUrl(signedUrlObject.downloadUrl);

                setCurrentStatus('success');
            } catch (error) {
                console.error(
                    `Error in retrieving document and inferences with ${[
                        props.selectedCaseId,
                        props.selectedDocumentId
                    ]}: ${error}`
                );
                setCurrentStatus('error');
            }
        };

        getDocumentData();
    }, [props.selectedCaseId, props.selectedDocumentId, getDocumentByCaseAndDocumentId, getDocumentToDownloadTrigger]);

    useEffect(() => {
        setDocumentPageCount(getDocumentPageCount(documentProcessingResults, 'LINE'));
    }, [documentProcessingResults]);
    console.log('standardEntities', docData.standardEntities);

    const mainTabs = [
        {
            label: 'Entity Detection',
            id: 'entityDetection',
            content: (
                <EntityDetectionTab
                    selectedDocumentFileType={props.selectedDocumentFileType}
                    selectedDocumentUrl={documentUrl}
                    standardEntities={docData.standardEntities}
                    medicalEntities={docData.medicalEntities}
                    piiEntities={docData.piiEntities}
                    documentPageCount={documentPageCount}
                    currentPageNumber={currentPageNumber}
                    switchPage={switchPage}
                    comprehendService={COMPREHEND_SERVICE}
                    entityType={EntityTypes.ENTITY_STANDARD}
                    selectedDocumentId={props.selectedDocumentId}
                    selectedCaseId={props.selectedCaseId}
                    currentStatus={currentStatus}
                    selectedEntities={selectedEntities}
                    setSelectedEntities={setSelectedEntities}
                    previewRedaction={previewRedaction}
                    setPreviewRedaction={setPreviewRedaction}
                    retrieveSignedUrl={retrieveSignedUrl}
                    dataTestId="entity-detection-tab"
                    textractText={docData.textractDetectResponse}
                />
            )
        },
        {
            label: 'Medical Entity Detection',
            id: 'medicalEntityDetection',
            content: (
                <EntityDetectionTab
                    selectedDocumentFileType={props.selectedDocumentFileType}
                    selectedDocumentUrl={documentUrl}
                    standardEntities={docData.standardEntities}
                    medicalEntities={docData.medicalEntities}
                    piiEntities={docData.piiEntities}
                    documentPageCount={documentPageCount}
                    currentPageNumber={currentPageNumber}
                    switchPage={switchPage}
                    comprehendService={COMPREHEND_MEDICAL_SERVICE}
                    entityType={EntityTypes.MEDICAL_ENTITY}
                    selectedDocumentId={props.selectedDocumentId}
                    selectedCaseId={props.selectedCaseId}
                    currentStatus={currentStatus}
                    selectedEntities={selectedEntities}
                    setSelectedEntities={setSelectedEntities}
                    previewRedaction={previewRedaction}
                    setPreviewRedaction={setPreviewRedaction}
                    retrieveSignedUrl={retrieveSignedUrl}
                    dataTestId="medical-entity-detection-tab"
                    textractText={docData.textractDetectResponse}
                />
            )
        },
        {
            label: 'PII Detection',
            id: 'piiDetection',
            content: (
                <EntityDetectionTab
                    selectedDocumentFileType={props.selectedDocumentFileType}
                    selectedDocumentUrl={documentUrl}
                    standardEntities={docData.standardEntities}
                    medicalEntities={docData.medicalEntities}
                    piiEntities={docData.piiEntities}
                    documentPageCount={documentPageCount}
                    currentPageNumber={currentPageNumber}
                    switchPage={switchPage}
                    comprehendService={COMPREHEND_SERVICE}
                    entityType={EntityTypes.PII}
                    selectedDocumentId={props.selectedDocumentId}
                    selectedCaseId={props.selectedCaseId}
                    currentStatus={currentStatus}
                    selectedEntities={selectedEntities}
                    setSelectedEntities={setSelectedEntities}
                    previewRedaction={previewRedaction}
                    setPreviewRedaction={setPreviewRedaction}
                    retrieveSignedUrl={retrieveSignedUrl}
                    dataTestId="pii-detection-tab"
                    textractText={docData.textractDetectResponse}
                />
            )
        },
        {
            label: 'Raw Text',
            id: 'textractRawText',
            content: (
                <TextractTab
                    selectedDocumentFileType={props.selectedDocumentFileType}
                    selectedDocumentUrl={documentUrl}
                    documentLines={docData.lines}
                    kvPairs={docData.pairs}
                    tables={docData.tables}
                    documentPageCount={documentPageCount}
                    currentPageNumber={currentPageNumber}
                    switchPage={switchPage}
                    textractOutputType={TEXTRACT_RAW_TEXT}
                    currentStatus={currentStatus}
                    retrieveSignedUrl={retrieveSignedUrl}
                    dataTestId="textract-raw-text-tab"
                />
            )
        },
        {
            label: 'Key-Value Pairs',
            id: 'textractKeyValuePairs',
            content: (
                <TextractTab
                    selectedDocumentFileType={props.selectedDocumentFileType}
                    selectedDocumentUrl={documentUrl}
                    documentLines={docData.lines}
                    kvPairs={docData.pairs}
                    tables={docData.tables}
                    documentPageCount={documentPageCount}
                    currentPageNumber={currentPageNumber}
                    switchPage={switchPage}
                    textractOutputType={TEXTRACT_KEY_VALUE_PAIRS}
                    currentStatus={currentStatus}
                    retrieveSignedUrl={retrieveSignedUrl}
                    dataTestId="textract-key-value-pairs-tab"
                />
            )
        },
        {
            label: 'Tables',
            id: 'textractTables',
            content: (
                <TextractTab
                    selectedDocumentFileType={props.selectedDocumentFileType}
                    selectedDocumentUrl={documentUrl}
                    documentLines={docData.lines}
                    kvPairs={docData.pairs}
                    tables={docData.tables}
                    documentPageCount={documentPageCount}
                    currentPageNumber={currentPageNumber}
                    switchPage={switchPage}
                    textractOutputType={TEXTRACT_TABLES}
                    currentStatus={currentStatus}
                    retrieveSignedUrl={retrieveSignedUrl}
                    dataTestId="textract-tables-tab"
                />
            )
        }
    ];

    return (
        <AppLayout
            contentType="dashboard"
            navigationHide
            onToolsChange={({ detail }) => {
                setToolsOpen(detail.open);
            }}
            toolsOpen={toolsOpen}
            tools={<DocumentResultsInfoPanelContent />}
            content={
                <ContentLayout
                    header={
                        <div className="document-view-header">
                            <DocResultsPageHeader
                                onInfoLinkClick={() => {
                                    setToolsOpen(true);
                                }}
                                breadCrumbItems={{
                                    selectedCaseName: props.selectedCaseName,
                                    selectedDocumentName: props.selectedDocumentName
                                }}
                            />
                        </div>
                    }
                >
                    <div data-testid="document-view-box" className="document-view-box">
                        <Tabs tabs={mainTabs} data-testid="document-view-tabs" />
                    </div>
                </ContentLayout>
            }
            data-testid="document-view-app-layout"
        />
    );
}
