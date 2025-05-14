// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// eslint-disable-next-line import/no-unresolved
import '@aws-amplify/ui-react/styles.css';
import './App.css';

import React, { useState } from 'react';
import { Input, TopNavigation } from '@cloudscape-design/components';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import AppLayout from '@cloudscape-design/components/app-layout';
import CreateCaseView from './components/CreateCaseView/CreateCaseView.tsx';
import DocumentTable from './components/DocumentTable/DocumentTable.tsx';
import DocumentView from './components/DocumentView/DocumentView.tsx';
import SearchView from './components/SearchView/SearchView';
import UploadDocumentView from './components/UploadDocumentView.tsx';
import { withAuthenticator } from '@aws-amplify/ui-react';
import { useGetCasesQuery } from './store/reducers/caseApiSlice';

function App({ signOut, enableKendra, enableOpenSearch, workflowConfig, requiredDocs }) {
    const [selectedDocumentId, setSelectedDocumentId] = useState('');
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [selectedCaseName, setSelectedCaseName] = useState('');
    const [selectedDocumentName, setSelectedDocumentName] = useState('');
    const [selectedCaseRemainingRequiredDocs, setSelectedCaseRemainingRequiredDocs] = useState(requiredDocs);

    const [selectedDocumentFileType, setSelectedDocumentFileType] = useState(null);
    const { data: casesList } = useGetCasesQuery();
    const [searchValue, setSearchValue] = useState('');
    const [submittedSearchValue, setSubmittedSearchValue] = useState('');
    const navigate = useNavigate();
    const [workflowConfigState] = useState(workflowConfig);

    React.useEffect(() => {
        if (selectedCaseId && casesList) {
            const newRemainingDocs = Object.assign({}, requiredDocs);

            const selectedCase = casesList.filter((c) => c.caseId === selectedCaseId);

            for (let doc of selectedCase[0].caseDocuments) {
                if (newRemainingDocs[doc.docType]) {
                    newRemainingDocs[doc.docType] -= 1;
                }
            }
            setSelectedCaseRemainingRequiredDocs(newRemainingDocs);
        }
    }, [casesList, requiredDocs, selectedCaseId]);

    const documentTableProps = {
        selectedDocumentId: selectedDocumentId,
        setSelectedDocumentId: setSelectedDocumentId,
        selectedCaseId: selectedCaseId,
        setSelectedCaseId: setSelectedCaseId,
        selectedDocumentFileType: selectedDocumentFileType,
        setSelectedDocumentFileType: setSelectedDocumentFileType,
        casesList: casesList,
        setSelectedCaseName: setSelectedCaseName,
        numRequiredDocuments: workflowConfigState.NumRequiredDocuments,
        requiredDocTypes: workflowConfig.UniqueDocumentTypes,
        setSelectedDocumentName: setSelectedDocumentName
    };
    const documentViewProps = {
        selectedCaseId: selectedCaseId,
        selectedDocumentId: selectedDocumentId,
        selectedDocumentFileType: selectedDocumentFileType,
        selectedCaseName: selectedCaseName,
        selectedDocumentName: selectedDocumentName,
        setSelectedCaseId: setSelectedCaseId,
        setSelectedDocumentId: setSelectedDocumentId,
        setSelectedDocumentFileType: setSelectedDocumentFileType,
        setSelectedCaseName: setSelectedCaseName,
        setSelectedDocumentName: setSelectedDocumentName
    };
    const uploadDocumentViewProps = {
        caseName: selectedCaseName,
        caseId: selectedCaseId,
        casesList: casesList,
        workflowConfig: workflowConfigState,
        selectedCaseRemainingRequiredDocs: selectedCaseRemainingRequiredDocs
    };
    const searchViewProps = {
        searchValue: searchValue,
        setSearchValue: setSearchValue,
        submittedSearchValue: submittedSearchValue,
        setSubmittedSearchValue: setSubmittedSearchValue,
        casesList: casesList,
        caseName: selectedCaseId,
        setSelectedCaseId: setSelectedCaseId,
        setSelectedDocumentId: setSelectedDocumentId,
        setSelectedDocumentFileType: setSelectedDocumentFileType,
        enableKendra: enableKendra,
        enableOpenSearch: enableOpenSearch
    };

    const handleKeyDown = async (key) => {
        if (key === 'Enter') {
            setSubmittedSearchValue(searchValue);
            navigate('/search');
        }
    };

    return (
        <>
            <TopNavigation
                identity={{
                    href: '/',
                    title: 'Enhanced Document Understanding on AWS with Phrases'
                }}
                utilities={[
                    {
                        type: 'button',
                        text: 'Sign out',
                        ariaLabel: 'Sign out',
                        disableTextCollapse: true,
                        disableUtilityCollapse: true,
                        onClick: signOut,
                        variant: 'link'
                    }
                ]}
                search={
                    (enableKendra || enableOpenSearch) && (
                        <Input
                            ariaLabel="Input field"
                            clearAriaLabel="Clear"
                            value={searchValue}
                            type="search"
                            placeholder="Search"
                            onChange={({ detail }) => setSearchValue(detail.value)}
                            onKeyDown={({ detail }) => handleKeyDown(detail.key)}
                        />
                    )
                }
                i18nStrings={{
                    overflowMenuTriggerText: 'More',
                    overflowMenuTitleText: 'All',
                    searchIconAriaLabel: 'Search',
                    searchDismissIconAriaLabel: 'Close search'
                }}
            />
            <AppLayout
                contentType="dashboard"
                disableContentPaddings
                content={
                    <Routes>
                        <Route path="/" element={<DocumentTable {...documentTableProps} />} />
                        <Route path="/:caseId/document/:docId" element={<DocumentView {...documentViewProps} />} />
                        <Route path="/createCase" element={<CreateCaseView />} />
                        <Route path="/uploadDocument" element={<UploadDocumentView {...uploadDocumentViewProps} />} />
                        <Route path="/search" element={<SearchView {...searchViewProps} />} />
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                }
                toolsHide
                navigationHide
            />
        </>
    );
}

export default withAuthenticator(App);
