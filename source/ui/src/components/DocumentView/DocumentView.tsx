// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// @ts-nocheck

import './DocumentView.css';

import { AppLayout, ContentLayout, StatusIndicatorProps, Tabs } from '@cloudscape-design/components';
import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
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

import { AzureOpenAI } from 'openai';
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
    const [phrase, setPhrase] = React.useState<string>('');
    // console.log('documentProcessingResults', documentProcessingResults);

    const [selectedEntities, setSelectedEntities] = React.useState<any>({
        [EntityTypes.ENTITY_STANDARD]: [],
        [EntityTypes.PII]: [],
        [EntityTypes.MEDICAL_ENTITY]: []
    });
    const [previewRedaction, setPreviewRedaction] = React.useState('');
    const [toolsOpen, setToolsOpen] = React.useState(false);
    const [accumulatedFoundEntities, setAccumulatedFoundEntities] = React.useState<string[]>([]);

    const switchPage = (newPageNumber: number) => {
        setCurrentPageNumber(newPageNumber);
    };

    const openai_client = React.useMemo(() => {
        const apiKey = process.env.REACT_APP_OPENAI_KEY;
        const endpoint = process.env.REACT_APP_OPENAI_ENDPOINT;
        const deployment = 'gpt-4.1';
        const apiVersion = '2024-04-01-preview';
        const options = { endpoint, apiKey, deployment, apiVersion, dangerouslyAllowBrowser: true };

        return new AzureOpenAI(options);
    }, []);

    // docData is now a state, not a memoized value
    const [docData, setDocData] = React.useState<any>({
        pairs: [],
        lines: [],
        tables: [],
        standardEntities: {},
        medicalEntities: {},
        piiEntities: {},
        textractDetectResponse: [],
        formattedEntitiesForPrompt: ''
    });

    // Helper to compute docData from dependencies
    React.useEffect(() => {
        // Print all text blocks from textractDetectResponse to console and combine into one string
        let allTextractTextBlocks: string[] = [];
        if (documentProcessingResults && Array.isArray(documentProcessingResults.textractDetectResponse)) {
            documentProcessingResults.textractDetectResponse.forEach((page, pageIdx) => {
                if (Array.isArray(page.Blocks)) {
                    const textBlocks = page.Blocks.filter(
                        (block: any) => block.BlockType === 'LINE' || block.BlockType === 'WORD'
                    );
                    const texts = textBlocks.map((b: any) => b.Text);
                    allTextractTextBlocks.push(...texts);
                    console.log(`Textract Page ${pageIdx + 1} Text Blocks:`, texts);
                }
            });
        }
        const pairs = getDocumentKeyValuePairs(documentProcessingResults, 'KEY_VALUE_SET');
        const tables = getDocumentTables(documentProcessingResults, 'TABLE');
        const lines = getDocumentLines(documentProcessingResults, 'LINE');
        const standardEntities = { ...documentProcessingResults.comprehendGenericResponse } as any;

        const textractBlockToEntity = (textractBlock: any) => {
            const entity = {
                Score: textractBlock.Confidence / 100,
                BoundingBoxes: [
                    {
                        Height: textractBlock.Geometry.BoundingBox.Height,
                        Left: textractBlock.Geometry.BoundingBox.Left,
                        Top: textractBlock.Geometry.BoundingBox.Top,
                        Width: textractBlock.Geometry.BoundingBox.Width
                    }
                ],
                // Add the text if available
                Text: textractBlock.Text || ''
            };
            return entity;
        };

        const findPhraseInPage = (phrase: string, textractPageBlocks: any[]) => {
            const words = textractPageBlocks.filter((block: any) => block.BlockType === 'WORD');
            const foundPhrases = [];
            const phraseWords = phrase.trim().toLowerCase().split(/\s+/);
            for (let i = 0; i < words.length - phraseWords.length; i++) {
                let found = true;
                for (let j = 0; j < phraseWords.length; j++) {
                    if (!words[i + j].Text.toLowerCase().includes(phraseWords[j])) {
                        found = false;
                        break;
                    }
                }
                if (found) {
                    const foundPhraseWords = words.slice(i, i + phraseWords.length);
                    const entities = foundPhraseWords.map((word: any) => textractBlockToEntity(word));
                    foundPhrases.push(entities);
                }
            }
            return foundPhrases;
        };

        const wordEntitiesIntoPartialLineEntitiesByPage = (textractPageBlocks: any, wordEntitiesByPage: any) => {
            const lines = textractPageBlocks.filter((block: any) => block.BlockType === 'LINE');
            const lineEntities = [];
            for (let i = 0; i < lines.length; i++) {
                const lineEntity = {
                    Score: lines[i].Confidence / 100,
                    BoundingBoxes: [
                        {
                            Height: lines[i].Geometry.BoundingBox.Height,
                            Left: lines[i].Geometry.BoundingBox.Left + lines[i].Geometry.BoundingBox.Width,
                            Top: lines[i].Geometry.BoundingBox.Top,
                            Width: 0
                        }
                    ],
                    Text: lines[i].Text || ''
                };
                for (let j = 0; j < wordEntitiesByPage.length; j++) {
                    const wordEntity = wordEntitiesByPage[j];
                    const top = lineEntity.BoundingBoxes[0].Top;
                    const bottom = lineEntity.BoundingBoxes[0].Height + top;
                    if (bottom >= wordEntity.BoundingBoxes[0].Top && wordEntity.BoundingBoxes[0].Top >= top) {
                        if (wordEntity.BoundingBoxes[0].Left < lineEntity.BoundingBoxes[0].Left) {
                            lineEntity.BoundingBoxes[0].Left = wordEntity.BoundingBoxes[0].Left;
                        }
                        const spaces =
                            wordEntity.BoundingBoxes[0].Left -
                            (lineEntity.BoundingBoxes[0].Width + lineEntity.BoundingBoxes[0].Left);
                        lineEntity.BoundingBoxes[0].Width += wordEntity.BoundingBoxes[0].Width + spaces;
                    }
                }
                if (lineEntity.BoundingBoxes[0].Width > 0) {
                    lineEntities.push(lineEntity);
                }
            }
            return lineEntities;
        };

        const textract: any = documentProcessingResults.textractDetectResponse;
        const foundPhrasesByPage: Record<number, any> = {};
        const lineEntitiesByPage: any = {};
        const hardcodedPhrases: any[] = [];
        // Combine inputted phrase and hardcoded phrases
        const allPhrases = [phrase, ...hardcodedPhrases].filter(Boolean);

        if (Array.isArray(textract)) {
            for (const searchPhrase of allPhrases) {
                for (let i = 0; i < textract.length; i++) {
                    const foundPhrases = findPhraseInPage(searchPhrase, textract[i].Blocks);
                    if (!foundPhrases.length) {
                        continue;
                    }
                    // Merge found phrases for each page
                    if (!foundPhrasesByPage[i + 1]) {
                        foundPhrasesByPage[i + 1] = [];
                    }
                    foundPhrasesByPage[i + 1].push(...foundPhrases.flat());
                }
            }
            for (const pageNo of Object.keys(foundPhrasesByPage) as any) {
                const lineEntities = wordEntitiesIntoPartialLineEntitiesByPage(
                    textract[pageNo - 1].Blocks,
                    foundPhrasesByPage[pageNo]
                );
                if (!lineEntities.length) {
                    continue;
                }
                lineEntitiesByPage[pageNo] = lineEntities;
            }
        }

        const lineEntitiesByPageAndHardcoded = lineEntitiesByPage;
        standardEntities.LLM = {
            // ...(standardEntities.OTHER || {}),
            [phrase]: lineEntitiesByPageAndHardcoded
        };

        // Collect all entities from standard, medical, and pii
        let allEntities: any[] = [];
        if (standardEntities) {
            Object.values(standardEntities).forEach((v) => {
                if (Array.isArray(v)) allEntities.push(...v);
                else if (typeof v === 'object' && v !== null) allEntities.push(...Object.values(v).flat());
            });
        }
        if (documentProcessingResults.comprehendMedicalResponse) {
            Object.values(documentProcessingResults.comprehendMedicalResponse).forEach((v) => {
                if (Array.isArray(v)) allEntities.push(...v);
                else if (typeof v === 'object' && v !== null) allEntities.push(...Object.values(v).flat());
            });
        }
        if (documentProcessingResults.comprehendPiiResponse) {
            Object.values(documentProcessingResults.comprehendPiiResponse).forEach((v) => {
                if (Array.isArray(v)) allEntities.push(...v);
                else if (typeof v === 'object' && v !== null) allEntities.push(...Object.values(v).flat());
            });
        }

        // Gather all 2nd-level dictionary keys from all entity result objects into a single list
        const gatherSecondLevelKeys = (...objs: any[]) => {
            const allKeys: string[] = [];
            objs.forEach((obj) => {
                if (!obj || typeof obj !== 'object') return;
                Object.values(obj).forEach((v) => {
                    if (v && typeof v === 'object') {
                        allKeys.push(...Object.keys(v));
                    }
                });
            });
            return allKeys;
        };
        const allSecondLevelKeys = gatherSecondLevelKeys(
            documentProcessingResults.comprehendGenericResponse,
            documentProcessingResults.comprehendMedicalResponse,
            documentProcessingResults.comprehendPiiResponse
        );
        console.log('ALL 2nd-level keys (entity texts) combined:', allSecondLevelKeys);
        // Print both to console
        console.log('ALL ENTITIES:', allEntities);

        // Format entity list and all text blocks for LLM system prompt
        const textractTextCombined = allTextractTextBlocks.join(' ');
        const formattedEntitiesForPrompt =
            allSecondLevelKeys.length > 0
                ? `Document contains the following extracted entity texts (unique, from all entity types):\n- ` +
                  allSecondLevelKeys.join('\n- ') +
                  (textractTextCombined
                      ? `\n\nFull document text (all lines and words, space-separated):\n${textractTextCombined}`
                      : '')
                : 'No entity texts were extracted from the document.';
        // Print the prompt to the console for inspection
        console.log('LLM SYSTEM PROMPT FOR CHAT SIMULATION:', formattedEntitiesForPrompt);

        setDocData({
            pairs,
            lines,
            tables,
            standardEntities,
            medicalEntities: documentProcessingResults.comprehendMedicalResponse,
            piiEntities: documentProcessingResults.comprehendPiiResponse,
            textractDetectResponse: documentProcessingResults.textractDetectResponse,
            formattedEntitiesForPrompt
        });
    }, [documentProcessingResults, props.textractDetectResponse, phrase]);

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
                    phrase={phrase}
                    setPhrase={setPhrase}
                    accumulatedFoundEntities={accumulatedFoundEntities}
                    setAccumulatedFoundEntities={setAccumulatedFoundEntities}
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
                    comprehendService={COMPREHEND_SERVICE}
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
                    phrase={phrase}
                    setPhrase={setPhrase}
                    accumulatedFoundEntities={accumulatedFoundEntities}
                    setAccumulatedFoundEntities={setAccumulatedFoundEntities}
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
                    phrase={phrase}
                    setPhrase={setPhrase}
                    accumulatedFoundEntities={accumulatedFoundEntities}
                    setAccumulatedFoundEntities={setAccumulatedFoundEntities}
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

    // Chatbot simulation state
    const [chatInput, setChatInput] = React.useState('');
    const [chatHistory, setChatHistory] = React.useState<{ sender: 'user' | 'bot'; message: string }[]>([]);

    // Chatbot handler using OpenAI client
    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        const userMessage = chatInput.trim();
        setChatHistory((prev) => [...prev, { sender: 'user', message: userMessage }]);
        setChatInput('');
        console.log('docuennt darta', docData);

        try {
            // System prompt includes the extracted entity texts for LLM context
            const systemPrompt = docData.formattedEntitiesForPrompt;
            const messages = [
                { role: 'system', content: systemPrompt },
                ...chatHistory.map((entry) => ({
                    role: entry.sender === 'user' ? 'user' : 'assistant',
                    content: entry.message
                })),
                { role: 'user', content: userMessage }
            ] as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

            // @ts-ignore: openai_client may not have types for chat.completions.create
            const response = await openai_client.chat.completions.create({
                model: 'gpt-4.1',
                messages
            });
            const botMessage = response.choices?.[0]?.message?.content || 'No response from model.';
            // Find entities/phrases in botMessage and update state
            const allEntities = (() => {
                // Gather all entities/phrases from docData
                let entities: string[] = [];
                // Add 2nd-level keys from standard, medical, pii entities
                const gatherSecondLevelKeys = (obj: any) => {
                    if (!obj || typeof obj !== 'object') return [];
                    let keys: string[] = [];
                    Object.values(obj).forEach((v) => {
                        if (v && typeof v === 'object') {
                            keys.push(...Object.keys(v));
                        }
                    });
                    return keys;
                };
                entities.push(...gatherSecondLevelKeys(docData.standardEntities));
                entities.push(...gatherSecondLevelKeys(docData.medicalEntities));
                entities.push(...gatherSecondLevelKeys(docData.piiEntities));
                // Add hardcoded phrases and phrase input
                const hardcodedPhrases: string[] = [];
                if (phrase) entities.push(phrase);
                entities.push(...hardcodedPhrases);
                // Remove duplicates and empty
                return Array.from(new Set(entities.filter(Boolean)));
            })();
            const foundEntities = allEntities.filter((entity) =>
                botMessage.toLowerCase().includes(entity.toLowerCase())
            );
            // Accumulate found entities, avoiding duplicates
            setAccumulatedFoundEntities((prev) => {
                const newSet = new Set(prev);
                foundEntities.forEach((entity) => {
                    if (entity && !newSet.has(entity)) {
                        newSet.add(entity);
                    }
                });
                return Array.from(newSet);
            });

            // Add accumulatedFoundEntities found in docData.standardEntities to selectedEntities
            const newEntityTuples: any[] = [];
            if (docData && docData.standardEntities) {
                Object.entries(docData.standardEntities).forEach(([entityType, entityObj]: [string, any]) => {
                    if (entityObj && typeof entityObj === 'object') {
                        Object.entries(entityObj).forEach(([entityName, pagesObj]: [string, any]) => {
                            if (accumulatedFoundEntities.includes(entityName)) {
                                if (pagesObj && typeof pagesObj === 'object') {
                                    Object.keys(pagesObj).forEach((page) => {
                                        newEntityTuples.push([entityType, entityName, page]);
                                    });
                                }
                            }
                        });
                    }
                });
            }
            if (newEntityTuples.length > 0) {
                setSelectedEntities((prev: any) => ({
                    ...prev,
                    ['entity-standard']: [...prev['entity-standard'], ...newEntityTuples]
                }));
            }

            setChatHistory((prev) => [...prev, { sender: 'bot', message: botMessage }]);
        } catch (err: any) {
            setChatHistory((prev) => [
                ...prev,
                { sender: 'bot', message: 'Error communicating with LLM: ' + (err?.message || 'Unknown error') }
            ]);
        }
    };
    // Print accumulated found entities/phrases to console whenever it changes
    React.useEffect(() => {
        if (accumulatedFoundEntities.length > 0) {
            console.log('Entities/phrases found in bot responses (accumulated):', accumulatedFoundEntities);

            // Copy matching entityNames into LLM entityType in standardEntities
            setDocData((prevDocData: any) => {
                if (!prevDocData || !prevDocData.standardEntities) return prevDocData;
                const newLLM: any = {};
                Object.entries(prevDocData.standardEntities).forEach(([entityType, entityObj]: [string, any]) => {
                    if (entityObj && typeof entityObj === 'object') {
                        Object.entries(entityObj).forEach(([entityName, pagesObj]: [string, any]) => {
                            if (accumulatedFoundEntities.includes(entityName)) {
                                newLLM[entityName] = pagesObj;
                            }
                        });
                    }
                });
                // Only update if there are new LLM entities
                if (Object.keys(newLLM).length > 0) {
                    const updatedDocData = {
                        ...prevDocData,
                        standardEntities: {
                            ...prevDocData.standardEntities,
                            LLM: newLLM
                        }
                    };
                    console.log('Updated docData:', updatedDocData);
                    return updatedDocData;
                }
                return prevDocData;
            });
        }
    }, [accumulatedFoundEntities]);

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
                    {/* Chatbot Simulation Section */}
                    <div
                        style={{
                            marginTop: 32,
                            padding: 16,
                            border: '1px solid #ddd',
                            borderRadius: 8,
                            width: '100%',
                            boxSizing: 'border-box'
                        }}
                    >
                        <h3>Chatbot Simulation</h3>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                minHeight: 80,
                                marginBottom: 12
                            }}
                        >
                            {chatHistory.map((entry, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'row',
                                        alignItems: 'start',
                                        marginTop: 12
                                    }}
                                >
                                    <span
                                        style={{
                                            borderRadius: '50%',
                                            width: '25px',
                                            height: '25px',
                                            backgroundColor: entry.sender === 'user' ? 'red' : 'blue'
                                        }}
                                    ></span>
                                    <span
                                        style={{
                                            padding: '0px 8px',
                                            margin: 0,
                                            maxWidth: '75vw'
                                        }}
                                    >
                                        {entry.sender === 'bot' ? (
                                            <ReactMarkdown>{entry.message}</ReactMarkdown>
                                        ) : (
                                            entry.message
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: 8 }}>
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Type here..."
                                style={{
                                    flex: 1,
                                    padding: 6,
                                    borderRadius: 6,
                                    border: '1px solid #ccc'
                                }}
                                data-testid="chatbot-input"
                            />
                            <button type="submit" style={{ padding: '6px 16px', borderRadius: 6 }}>
                                Send
                            </button>
                        </form>
                    </div>
                </ContentLayout>
            }
            data-testid="document-view-app-layout"
        />
    );
}
