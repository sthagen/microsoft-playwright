/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { launchProcess } from '../processLauncher';
import { ChildProcess } from 'child_process';
import { Progress, runAbortableTask } from '../progress';
import * as types from '../types';
import { assert } from '../../utils/utils';

const fps = 25;

export class VideoRecorder {
  private _process: ChildProcess | null = null;
  private _gracefullyClose: (() => Promise<void>) | null = null;
  private _lastWritePromise: Promise<void>;
  private _lastFrameTimestamp: number = 0;
  private _lastFrameBuffer: Buffer | null = null;
  private _lastWriteTimestamp: number = 0;
  private readonly _progress: Progress;
  private readonly _ffmpegPath: string;

  static async launch(ffmpegPath: string, options: types.PageScreencastOptions): Promise<VideoRecorder> {
    if (!options.outputFile.endsWith('.webm'))
      throw new Error('File must have .webm extension');

    return await runAbortableTask(async progress => {
      const recorder = new VideoRecorder(ffmpegPath, progress);
      await recorder._launch(options);
      return recorder;
    }, 0, 'browser');
  }

  private constructor(ffmpegPath: string, progress: Progress) {
    this._progress = progress;
    this._ffmpegPath = ffmpegPath;
    this._lastWritePromise = Promise.resolve();
  }

  private async _launch(options: types.PageScreencastOptions) {
    assert(!this._isRunning());
    const w = options.width;
    const h = options.height;
    const args = `-loglevel error -f image2pipe -c:v mjpeg -i - -y -an -r ${fps} -c:v vp8 -vf pad=${w}:${h}:0:0:gray,crop=${w}:${h}:0:0`.split(' ');
    args.push(options.outputFile);
    const progress = this._progress;
    const { launchedProcess, gracefullyClose } = await launchProcess({
      executablePath: this._ffmpegPath,
      args,
      pipeStdin: true,
      progress,
      tempDirectories: [],
      attemptToGracefullyClose: async () => {
        progress.log('Closing stdin...');
        launchedProcess.stdin.end();
      },
      onExit: (exitCode, signal) => {
        progress.log(`ffmpeg onkill exitCode=${exitCode} signal=${signal}`);
      },
    });
    launchedProcess.stdin.on('finish', () => {
      progress.log('ffmpeg finished input.');
    });
    launchedProcess.stdin.on('error', () => {
      progress.log('ffmpeg error.');
    });
    this._process = launchedProcess;
    this._gracefullyClose = gracefullyClose;
  }

  async writeFrame(frame: Buffer, timestamp: number) {
    assert(this._process);
    if (!this._isRunning())
      return;
    const duration = this._lastFrameTimestamp ? Math.max(1, Math.round(25 * (timestamp - this._lastFrameTimestamp))) : 1;
    this._progress.log(`writing ${duration} frame(s)`);
    this._lastFrameBuffer = frame;
    this._lastFrameTimestamp = timestamp;
    this._lastWriteTimestamp = Date.now();

    const previousWrites = this._lastWritePromise;
    let finishedWriting: () => void;
    this._lastWritePromise = new Promise(fulfill => finishedWriting = fulfill);
    const writePromise = this._lastWritePromise;
    await previousWrites;
    for (let i = 0; i < duration; i++) {
      const callFinish = i === (duration - 1);
      this._process.stdin.write(frame, (error: Error | null | undefined) => {
        if (error)
          this._progress.log(`ffmpeg failed to write: ${error}`);
        if (callFinish)
          finishedWriting();
      });
    }
    return writePromise;
  }

  async stop() {
    if (!this._gracefullyClose)
      return;

    if (this._lastWriteTimestamp) {
      const durationSec = (Date.now() - this._lastWriteTimestamp) / 1000;
      if (durationSec > 1 / fps)
        this.writeFrame(this._lastFrameBuffer!, this._lastFrameTimestamp + durationSec);
    }

    const close = this._gracefullyClose;
    this._gracefullyClose = null;
    await this._lastWritePromise;
    await close();
  }

  private _isRunning(): boolean {
    return !!this._gracefullyClose;
  }
}
