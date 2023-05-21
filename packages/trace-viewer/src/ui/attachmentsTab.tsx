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

import * as React from 'react';
import './attachmentsTab.css';
import { ImageDiffView } from '@web/components/imageDiffView';
import type { TestAttachment } from '@web/components/imageDiffView';
import type { ActionTraceEventInContext } from './modelUtil';

export const AttachmentsTab: React.FunctionComponent<{
  action: ActionTraceEventInContext | undefined,
}> = ({ action }) => {
  if (!action)
    return null;
  const expected = action.attachments?.find(a => a.name.endsWith('-expected.png') && (a.path || a.sha1)) as TestAttachment | undefined;
  const actual = action.attachments?.find(a => a.name.endsWith('-actual.png') && (a.path || a.sha1)) as TestAttachment | undefined;
  const diff = action.attachments?.find(a => a.name.endsWith('-diff.png') && (a.path || a.sha1)) as TestAttachment | undefined;
  const traceUrl = action.context.traceUrl;

  return <div className='attachments-tab'>
    {expected && actual && <div className='attachments-section'>Image diff</div>}
    {expected && actual && <ImageDiffView imageDiff={{
      name: 'Image diff',
      expected: { attachment: { ...expected, path: attachmentURL(traceUrl, expected) }, title: 'Expected' },
      actual: { attachment: { ...actual, path: attachmentURL(traceUrl, actual) } },
      diff: diff ? { attachment: { ...diff, path: attachmentURL(traceUrl, diff) } } : undefined,
    }} />}
    {<div className='attachments-section'>Attachments</div>}
    {action.attachments?.map(a => {
      return <div className='attachment-item'>
        <a target='_blank' href={attachmentURL(traceUrl, a)}>{a.name}</a>
      </div>;
    })}
  </div>;
};

function attachmentURL(traceUrl: string, attachment: {
  name: string;
  contentType: string;
  path?: string;
  sha1?: string;
  body?: string;
}) {
  if (attachment.sha1)
    return 'sha1/' + attachment.sha1 + '?trace=' + traceUrl;
  return 'file?path=' + attachment.path;
}
