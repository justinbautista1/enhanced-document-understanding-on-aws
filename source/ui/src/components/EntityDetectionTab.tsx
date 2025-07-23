// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Box, Container, StatusIndicatorProps } from '@cloudscape-design/components';
import { useCallback, useMemo, useState } from 'react';
import { renderStatus } from '../utils/common-renderers';
import { BoundingBox } from '../utils/interfaces';

import { EntityTypes } from '../utils/constants';
import DocumentRenderer from './DocumentRenderer/DocumentRenderer';
import EntitiesList from './EntitiesList';
import { getEntitiesToProcess } from './entityUtils';

type EntityDetectionTabProps = {
    selectedDocumentFileType: string | null;
    selectedDocumentUrl: string | null;
    selected?: string;
    standardEntities: any;
    medicalEntities: any;
    piiEntities: any;
    documentPageCount: number;
    currentPageNumber: number;
    switchPage: Function;
    comprehendService: string;
    entityType: string;
    selectedDocumentId: string | null;
    selectedCaseId: string | null;
    selectedEntities: any;
    setSelectedEntities: Function;
    previewRedaction: string;
    setPreviewRedaction: Function;
    currentStatus: StatusIndicatorProps.Type | undefined;
    dataTestId?: string;
    retrieveSignedUrl: Function;
    textractText: any;
    phrase: string;
    setPhrase: Function;
};

/**
 * EntityDetectionTab is used to render data for Generic, PII and Medical Comprehend inferences
 * @param props to be used to populate the tab
 * @returns
 */
export default function EntityDetectionTab(props: EntityDetectionTabProps) {
    let documentEntities = getEntitiesToProcess(props.entityType, props);
    const [inputPhrase, setInputPhrase] = useState<string>('');
    console.log('EntityDetectionTab documentEntities', documentEntities);
    console.log('selectedEntities', props.selectedEntities);

    const getFilteredArray = useCallback(
        (entityType: string) => {
            // Now allow selection at the instance level (4th element: instance index or id)
            return props.selectedEntities[entityType].filter((item: string[]) => {
                // If item has 4 elements, it's an instance selection: [entityType, entityValue, pageNumber, instanceIndex]
                if (item.length === 4) {
                    // Only show if current page matches
                    return item[2] === props.currentPageNumber.toString();
                }
                // If item has 3 elements, it's a page selection (legacy)
                if (item.length === 3) {
                    return item[2] === props.currentPageNumber.toString();
                }
                // If item has less, fallback to previous logic
                if (
                    props.selectedEntities[entityType].some(
                        (otherItem: string[]) =>
                            otherItem.length < item.length &&
                            otherItem.slice(0, item.length - 1).every((val, index) => val === item[index])
                    )
                ) {
                    return false;
                }
                return true;
            });
        },
        [props.currentPageNumber, props.selectedEntities]
    );

    // New: Get bounding box for a specific instance
    const getBoundingBoxForEntityInstance = useCallback((entities: any, entityPath: string[]) => {
        // entityPath: [entityType, entityValue, pageNumber, instanceIndex]
        let boundingBoxes: BoundingBox[] = [];
        const [type, value, page, instanceIdx] = entityPath;
        const pageInstances = entities[type]?.[value]?.[page];
        if (pageInstances && pageInstances[instanceIdx]) {
            boundingBoxes = boundingBoxes.concat(pageInstances[instanceIdx].BoundingBoxes);
        }
        return boundingBoxes;
    }, []);

    const getBoundingBoxesForEntityPage = useCallback((entities: any, entityPath: string[]) => {
        let boundingBoxes: BoundingBox[] = [];
        for (const pageInstance of entities[entityPath[0]][entityPath[1]][entityPath[2]]) {
            boundingBoxes = boundingBoxes.concat(pageInstance.BoundingBoxes);
        }
        return boundingBoxes;
    }, []);

    const getBoundingBoxesForEntityValue = useCallback(
        (entities: any, entityPath: string[]) => {
            let boundingBoxes: BoundingBox[] = [];
            if (props.currentPageNumber.toString() in entities[entityPath[0]][entityPath[1]]) {
                for (const pageInstance of entities[entityPath[0]][entityPath[1]][props.currentPageNumber.toString()]) {
                    boundingBoxes = boundingBoxes.concat(pageInstance.BoundingBoxes);
                }
            }
            return boundingBoxes;
        },
        [props.currentPageNumber]
    );

    const getBoundingBoxesForEntityType = useCallback(
        (entities: any, entityPath: string[]) => {
            let boundingBoxes: BoundingBox[] = [];
            for (const entity of Object.keys(entities[entityPath[0]])) {
                if (props.currentPageNumber.toString() in entities[entityPath[0]][entity]) {
                    for (const pageInstance of entities[entityPath[0]][entity][props.currentPageNumber.toString()]) {
                        boundingBoxes = boundingBoxes.concat(pageInstance.BoundingBoxes);
                    }
                }
            }
            return boundingBoxes;
        },
        [props.currentPageNumber]
    );

    const pageEntities = useMemo(() => {
        let boundingBoxes: BoundingBox[] = [];
        for (const entityType of Object.values(EntityTypes)) {
            if (props.selectedEntities[entityType] && props.selectedEntities[entityType].length > 0) {
                const entities = getEntitiesToProcess(entityType, props);
                const filteredArray = getFilteredArray(entityType);
                for (const entityPath of filteredArray) {
                    switch (entityPath.length) {
                        case 4:
                            boundingBoxes = boundingBoxes.concat(getBoundingBoxForEntityInstance(entities, entityPath));
                            break;
                        case 3:
                            boundingBoxes = boundingBoxes.concat(getBoundingBoxesForEntityPage(entities, entityPath));
                            break;
                        case 2:
                            boundingBoxes = boundingBoxes.concat(getBoundingBoxesForEntityValue(entities, entityPath));
                            break;
                        case 1:
                        default:
                            boundingBoxes = boundingBoxes.concat(getBoundingBoxesForEntityType(entities, entityPath));
                            break;
                    }
                }
            }
        }
        return boundingBoxes;
    }, [
        getBoundingBoxesForEntityPage,
        getBoundingBoxesForEntityType,
        getBoundingBoxesForEntityValue,
        getBoundingBoxForEntityInstance,
        getFilteredArray,
        props
    ]);

    const status = renderStatus(
        props.currentStatus,
        true,
        false,
        `An error occurred loading the document preview.`,
        ''
    );
    return (
        <div style={{ display: 'flex', height: '100%' }} data-testid={props.dataTestId}>
            <div style={{ width: '50%', float: 'left', paddingRight: '0.5%', paddingLeft: '1%' }}>
                <Container data-testid="document-rendering-container">
                    {status}
                    <DocumentRenderer
                        selectedDocumentFileType={props.selectedDocumentFileType}
                        selectedDocumentUrl={props.selectedDocumentUrl}
                        currentPageNumber={props.currentPageNumber}
                        switchPage={props.switchPage}
                        marks={pageEntities}
                        previewRedaction={props.previewRedaction}
                        retrieveSignedUrl={props.retrieveSignedUrl}
                        inputPhrase={inputPhrase}
                        setInputPhrase={setInputPhrase}
                    />
                </Container>
            </div>
            <div
                style={{
                    width: '50%',
                    float: 'left',
                    paddingLeft: '0.5%',
                    paddingRight: '1%',
                    height: '100%'
                }}
            >
                <Container fitHeight={true}>
                    <div>
                        <Box data-testid="tab-box">
                            <EntitiesList
                                entities={documentEntities}
                                documentPageCount={props.documentPageCount}
                                currentPageNumber={props.currentPageNumber}
                                switchPage={props.switchPage}
                                comprehendService={props.comprehendService}
                                entityType={props.entityType}
                                standardEntities={props.standardEntities}
                                medicalEntities={props.medicalEntities}
                                piiEntities={props.piiEntities}
                                selectedEntities={props.selectedEntities}
                                setSelectedEntities={props.setSelectedEntities}
                                selectedDocumentId={props.selectedDocumentId}
                                selectedCaseId={props.selectedCaseId}
                                previewRedaction={props.previewRedaction}
                                setPreviewRedaction={props.setPreviewRedaction}
                                currentStatus={props.currentStatus}
                                phrase={props.phrase}
                                setPhrase={props.setPhrase}
                                inputPhrase={inputPhrase}
                                setInputPhrase={setInputPhrase}
                            />
                        </Box>
                    </div>
                </Container>
            </div>
        </div>
    );
}
