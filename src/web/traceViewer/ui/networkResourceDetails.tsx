/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import './networkResourceDetails.css';
import * as React from 'react';
import { Expandable } from './helpers';
import { NetworkResourceTraceEvent } from '../../../server/trace/common/traceEvents';

const utf8Encoder = new TextDecoder('utf-8');

export const NetworkResourceDetails: React.FunctionComponent<{
  resource: NetworkResourceTraceEvent,
  index: number,
  selected: boolean,
  setSelected: React.Dispatch<React.SetStateAction<number>>,
}> = ({ resource, index, selected, setSelected }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [requestBody, setRequestBody] = React.useState<string | null>(null);
  const [responseBody, setResponseBody] = React.useState<ArrayBuffer | null>(null);

  React.useEffect(() => {
    setExpanded(false);
    setSelected(-1);
  }, [resource, setSelected]);

  React.useEffect(() => {
    const readResources = async  () => {
      if (resource.requestSha1 !== 'none') {
        const response = await fetch(`/sha1/${resource.requestSha1}`);
        const requestResource = await response.text();
        setRequestBody(requestResource);
      }

      if (resource.responseSha1 !== 'none') {
        const response = await fetch(`/sha1/${resource.responseSha1}`);
        const responseResource = await response.arrayBuffer();
        setResponseBody(responseResource);
      }
    };

    readResources();
  }, [expanded, resource.responseSha1, resource.requestSha1]);

  function formatBody(body: string | null, contentType: string): string {
    if (body === null)
      return 'Loading...';

    const bodyStr = body;

    if (bodyStr === '')
      return '<Empty>';

    if (contentType.includes('application/json')) {
      try {
        return JSON.stringify(JSON.parse(bodyStr), null, 2);
      } catch (err) {
        return bodyStr;
      }
    }

    if (contentType.includes('application/x-www-form-urlencoded'))
      return decodeURIComponent(bodyStr);

    return bodyStr;
  }

  function formatStatus(status: number): string {
    if (status >= 200 && status < 400)
      return 'status-success';

    if (status >= 400)
      return 'status-failure';

    return 'status-neutral';
  }

  const requestContentTypeHeader = resource.requestHeaders.find(q => q.name === 'Content-Type');
  const requestContentType = requestContentTypeHeader ? requestContentTypeHeader.value : '';

  return <div
    className={'network-request ' + (selected ? 'selected' : '')} onClick={() => setSelected(index)}>
    <Expandable expanded={expanded} setExpanded={setExpanded} style={{ width: '100%' }} title={
      <div className='network-request-title'>
        <div className={'network-request-title-status ' + formatStatus(resource.status)}>{resource.status}</div>
        <div className='network-request-title-method'>{resource.method}: &nbsp;</div>
        <div className='network-request-title-url'>{resource.url}</div>
        <div className='network-request-title-content-type'>{resource.contentType}</div>
      </div>
    } body={
      <div className='network-request-details'>
        <h4>URL</h4>
        <div className='network-request-details-url'>{resource.url}</div>
        <h4>Request Headers</h4>
        <div className='network-request-headers'>{resource.requestHeaders.map(pair => `${pair.name}: ${pair.value}`).join('\n')}</div>
        <h4>Response Headers</h4>
        <div className='network-request-headers'>{resource.responseHeaders.map(pair => `${pair.name}: ${pair.value}`).join('\n')}</div>
        {resource.requestSha1 !== 'none' ? <h4>Request Body</h4> : ''}
        {resource.requestSha1 !== 'none' ? <div className='network-request-body'>{formatBody(requestBody, requestContentType)}</div> : ''}
        <h4>Response Body</h4>
        {resource.responseSha1 === 'none' ? <div className='network-request-response-body'>Response body is not available for this request.</div> : ''}
        {responseBody !== null && resource.contentType.includes('image') ? <img src={`data:${resource.contentType};base64,${btoa(String.fromCharCode(...new Uint8Array(responseBody)))}`} /> : ''}
        {responseBody !== null && !resource.contentType.includes('image') ? <div className='network-request-response-body'>{formatBody(utf8Encoder.decode(responseBody), resource.contentType)}</div> : ''}
      </div>
    }/>
  </div>;
};
