// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as React from 'react';
interface CustomEventLike<T> {
    detail: T;
}
export interface FilteringOptions<T> {
    filteringFunction?: (item: T, filteringText: string, filteringFields?: string[]) => boolean;
    fields?: string[];
}
export interface SortingState<T> {
    isDescending?: boolean;
    sortingColumn: SortingColumn<T>;
}
export interface SortingColumn<T> {
    sortingField?: string;
    sortingComparator?: (a: T, b: T) => number;
}
export interface SelectionChangeDetail<T> {
    selectedItems: ReadonlyArray<T>;
}
export type TrackBy<T> = string | ((item: T) => string);
export interface UseCollectionOptions<T> {
    filtering?: FilteringOptions<T> & {
        empty?: React.ReactNode;
        noMatch?: React.ReactNode;
        defaultFilteringText?: string;
    };
    propertyFiltering?: {
        empty?: React.ReactNode;
        noMatch?: React.ReactNode;
        filteringProperties: readonly PropertyFilterProperty[];
        filteringFunction?: (item: T, query: PropertyFilterQuery) => boolean;
        defaultQuery?: PropertyFilterQuery;
    };
    sorting?: {
        defaultState?: SortingState<T>;
    };
    pagination?: {
        defaultPage?: number;
        pageSize?: number;
    };
    selection?: {
        defaultSelectedItems?: ReadonlyArray<T>;
        keepSelection?: boolean;
        trackBy?: TrackBy<T>;
    };
}
export interface CollectionActions<T> {
    setFiltering(filteringText: string): void;
    setCurrentPage(pageNumber: number): void;
    setSorting(state: SortingState<T>): void;
    setSelectedItems(selectedItems: ReadonlyArray<T>): void;
    setPropertyFiltering(query: PropertyFilterQuery): void;
}
interface UseCollectionResultBase<T> {
    items: ReadonlyArray<T>;
    allPageItems: ReadonlyArray<T>;
    actions: CollectionActions<T>;
    collectionProps: {
        empty?: React.ReactNode;
        onSortingChange?(event: CustomEventLike<SortingState<T>>): void;
        sortingColumn?: SortingColumn<T>;
        sortingDescending?: boolean;
        selectedItems?: ReadonlyArray<T>;
        onSelectionChange?(event: CustomEventLike<SelectionChangeDetail<T>>): void;
        trackBy?: string | ((item: T) => string);
        ref: React.RefObject<CollectionRef>;
        totalItemsCount?: number;
        firstIndex?: number;
    };
    filterProps: {
        disabled?: boolean;
        filteringText: string;
        onChange(
            event: CustomEventLike<{
                filteringText: string;
            }>
        ): void;
    };
    propertyFilterProps: {
        query: PropertyFilterQuery;
        onChange(event: CustomEventLike<PropertyFilterQuery>): void;
        filteringProperties: readonly PropertyFilterProperty[];
        filteringOptions: readonly PropertyFilterOption[];
    };
    paginationProps: {
        disabled?: boolean;
        currentPageIndex: number;
        onChange(
            event: CustomEventLike<{
                currentPageIndex: number;
            }>
        ): void;
    };
}
export interface UseCollectionResult<T> extends UseCollectionResultBase<T> {
    filteredItemsCount: number | undefined;
    paginationProps: UseCollectionResultBase<T>['paginationProps'] & {
        pagesCount: number;
    };
}
export interface CollectionRef {
    scrollToTop: () => void;
}
export type PropertyFilterOperator = '<' | '<=' | '>' | '>=' | ':' | '!:' | '=' | '!=';
export interface PropertyFilterOperatorExtended<TokenValue> {
    operator: PropertyFilterOperator;
    match?: PropertyFilterOperatorMatch<TokenValue>;
    form?: PropertyFilterOperatorForm<TokenValue>;
    format?: PropertyFilterOperatorFormat<TokenValue>;
}
export type PropertyFilterOperatorMatch<TokenValue> =
    | PropertyFilterOperatorMatchByType
    | PropertyFilterOperatorMatchCustom<TokenValue>;
export type PropertyFilterOperatorMatchByType = 'date' | 'datetime';
export type PropertyFilterOperatorMatchCustom<TokenValue> = (itemValue: unknown, tokenValue: TokenValue) => boolean;
export interface PropertyFilterOperatorFormProps<TokenValue> {
    value: null | TokenValue;
    onChange: (value: null | TokenValue) => void;
    filter?: string;
    operator: PropertyFilterOperator;
}
export type PropertyFilterOperatorForm<TokenValue> = React.FC<PropertyFilterOperatorFormProps<TokenValue>>;
export type PropertyFilterOperatorFormat<TokenValue> = (value: TokenValue) => string;
export type PropertyFilterOperation = 'and' | 'or';
export interface PropertyFilterToken {
    value: any;
    propertyKey?: string;
    operator: PropertyFilterOperator;
}
export interface PropertyFilterQuery {
    tokens: readonly PropertyFilterToken[];
    operation: PropertyFilterOperation;
}
export interface PropertyFilterProperty<TokenValue = any> {
    key: string;
    groupValuesLabel: string;
    propertyLabel: string;
    operators?: readonly (PropertyFilterOperator | PropertyFilterOperatorExtended<TokenValue>)[];
    defaultOperator?: PropertyFilterOperator;
    group?: string;
}
export interface PropertyFilterOption {
    propertyKey: string;
    value: string;
    label?: string;
}
