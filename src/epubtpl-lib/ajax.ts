
import * as fs from 'fs-extra';
import fetch = require('isomorphic-fetch');
import * as path from "path";
import { IFiles } from '../config';
import fileType = require('file-type');
import hashSum = require('hash-sum');
import imagemin = require('imagemin');
import imageminJpegtran = require('imagemin-jpegtran');
import imageminPngquant = require('imagemin-pngquant');
import imageminOptipng = require('imagemin-optipng');

export { fetch }

export async function fetchFile(file: IFiles, ...argv)
{
	let _file;
	let err;

	if (file.data)
	{
		_file = file.data;
	}

	if (!_file && file.url)
	{
		_file = await fetch(file.url, ...argv)
			.then(function (ret)
			{

				//console.log(file.name, ret.type, ret.headers);

				if (!file.mime)
				{
					let c = ret.headers.get('content-type');

					if (Array.isArray(c))
					{
						file.mime = c[0];
					}
					else if (typeof c === 'string')
					{
						file.mime = c;
					}
				}

				try
				{
					// @ts-ignore
					if (!file.name && !file.basename && ret.headers.raw()['content-disposition'][0].match(/filename=(['"])?([^\'"]+)\1/))
					{
						let filename = RegExp.$2;

						file.name = path.basename(filename);

						//console.log(file.name);
					}
				}
				catch (e)
				{

				}

				//console.log(ret.headers, ret.headers.raw()['content-disposition'][0]);
				//.getResponseHeader('Content-Disposition')

				// @ts-ignore
				return ret.buffer()
			})
			.catch(function (e)
			{
				err = e;
			})

		;
	}

	if (!_file && file.file)
	{
		_file = await fs.readFile(file.file);
	}

	if (_file)
	{
		/**
		 * 如果此部分發生錯誤則自動忽略
		 */
		await Promise
			.resolve()
			.then(function ()
			{
				return imagemin.buffer(_file, {
					plugins: [
						imageminOptipng(),
						imageminJpegtran(),
						imageminPngquant({quality: '65-80'})
					]
				})
			})
			.then(function (buf)
			{
				if (Buffer.isBuffer(buf))
				{
					_file = buf
				}
			})
			.catch(function (e)
			{
				console.error('[ERROR] imagemin 發生不明錯誤，本次將忽略此錯誤', e.toString().replace(/^\s+|\s+$/, ''));
				//console.error(e);
			})
		;
	}

	if (!_file)
	{
		let e = err || new ReferenceError();
		e.data = file;

		throw e;
	}

	if (file.name && file.ext !== '')
	{
		file.ext = file.ext || path.extname(file.name);

		if (!file.ext)
		{
			file.ext = null;
		}
	}

	if (!file.ext || !file.mime)
	{
		let data = fileType(_file);

		if (data)
		{
			if (file.ext !== '')
			{
				file.ext = file.ext || '.' + data.ext;
			}

			file.mime = file.mime || data.mime;
		}
		else if (file.ext !== '')
		{
			file.ext = file.ext || '.unknow';
		}
	}

	if (!file.name)
	{
		file.name = (file.basename || hashSum(file)) + file.ext;
	}

	file.data = _file;

	return file;
}

export default fetch;
