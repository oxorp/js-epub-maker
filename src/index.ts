import * as _slugify from 'slugify';
import * as moment from 'moment';
import { TemplateManagers, templateManagers } from './template';
import * as shortid from 'shortid';
import * as hashSum from 'hash-sum';
import { trimFilename } from 'fs-iconv';
import * as path from 'path';
import { parseFileSetting } from './epubtpl-lib/zip';
import { createUUID } from './lib/uuid';
import { EpubConfig, IEpubConfig, ICover, IRightsConfig, IFiles, IStylesheet, ICollection } from './config';
import JSZip = require('jszip');

export { shortid, hashSum }

export function slugify(input: string, ...argv): string
{
	let fn = EpubMaker.libSlugify ||
		// @ts-ignore
		_slugify as ISlugify
	;

	return fn(input || '', ...argv).trim();
}

export function slugifyWithFallback(input: string, ...argv): string
{
	let ret = slugify(input, ...argv);

	return ret || hashSum(input);
}

export class EpubMaker
{
	public epubConfig: EpubConfig;

	constructor(options = {}, config?: IEpubConfig)
	{
		this.epubConfig = new EpubConfig(config, options);
	}

	static create(options?, ...argv)
	{
		return new this(options, ...argv);
	}

	withUuid(uuid: string)
	{
		this.epubConfig.uuid = uuid;
		return this;
	}

	withTemplate(templateName)
	{
		this.epubConfig.templateName = templateName;
		return this;
	}

	slugify(input: string, ...argv): string
	{
		let fn = this.epubConfig.options.libSlugify || slugify;

		return fn(input || '', ...argv).trim();
	}

	slugifyWithFallback(input: string, ...argv): string
	{
		let ret = this.slugify(input, ...argv);

		return ret || hashSum(input);
	}

	withTitle(title: string, title_short?: string)
	{
		this.epubConfig.title = title;
		// @ts-ignore
		this.epubConfig.slug = this.slugifyWithFallback(title || title_short);

		if (title_short)
		{
			this.epubConfig.title_short = title_short;
		}

		return this;
	}

	addTitles(titles: string[])
	{
		this.epubConfig.titles = titles || [];

		return this;
	}

	withLanguage(lang: string)
	{
		this.epubConfig.lang = lang;
		return this;
	}

	get lang()
	{
		return this.epubConfig.lang;
	}

	withAuthor(fullName: string, url?: string)
	{
		this.epubConfig.author = fullName;
		this.epubConfig.authorUrl = url;
		return this;
	}

	addAuthor(fullName: string, url?: string)
	addAuthor(fullName: string[])
	addAuthor(fullName: { [key: string]: string; })
	addAuthor(fullName: string
		| string[]
		| { [key: string]: string; }
		, url?: string
	)
	{
		let self = this;

		if (Array.isArray(fullName))
		{
			fullName.forEach(name => {
				name && self.epubConfig.addAuthor(name);
			});
		}
		else if (typeof fullName == 'object')
		{
			for (let name in fullName)
			{
				name && self.epubConfig.addAuthor(name, fullName[name]);
			}
		}
		else if (fullName)
		{
			self.epubConfig.addAuthor(fullName as string, url);
		}

		return this;
	}

	withPublisher(publisher: string)
	{
		this.epubConfig.publisher = publisher;
		return this;
	}

	withCollection(data: ICollection)
	{
		this.epubConfig.collection = Object.assign(this.epubConfig.collection || {}, data);

		//console.log(this.epubConfig.collection);

		return this;
	}

	withSeries(name: string, position = 1)
	{
		if (name)
		{
			this.withCollection({
				name,
				position,
				type: 'series',
			})
		}
	}

	withModificationDate(modificationDate, ...argv)
	{
		let data = moment(modificationDate, ...argv).local();

		this.epubConfig.modification = data;
		this.epubConfig.modificationDate = data.format(EpubMaker.dateFormat);
		this.epubConfig.modificationDateYMD = data.format('YYYY-MM-DD');
		return this;
	}

	withRights(rightsConfig: IRightsConfig)
	{
		this.epubConfig.rights = rightsConfig;
		return this;
	}

	withCover(coverUrl: string | ICover, rightsConfig?: IRightsConfig)
	{
		let cover = parseFileSetting(coverUrl, this.epubConfig) as ICover;

		if (cover && rightsConfig)
		{
			cover.rights = rightsConfig;
		}

		if (!cover)
		{
			throw new ReferenceError();
		}

		this.epubConfig.cover = Object.assign(this.epubConfig.cover || {}, cover);

		//this.epubConfig.coverUrl = coverUrl;
		//this.epubConfig.coverRights = rightsConfig;

		return this;
	}

	withAttributionUrl(attributionUrl)
	{
		this.epubConfig.attributionUrl = attributionUrl;
		return this;
	}

	withStylesheetUrl(stylesheetUrl, replaceOriginal?: boolean)
	{
		let data = parseFileSetting(stylesheetUrl, this.epubConfig) as IStylesheet;

		this.epubConfig.stylesheet = Object.assign(this.epubConfig.stylesheet, data, {
			replaceOriginal: replaceOriginal,
		});

		return this;
	}

	withSection(section: EpubMaker.Section)
	{
		section.parentEpubMaker = this;

		this.epubConfig.sections.push(section);
		Array.prototype.push.apply(this.epubConfig.toc, section.collectToc());
		Array.prototype.push.apply(this.epubConfig.landmarks, section.collectLandmarks());
		return this;
	}

	withAdditionalFile(fileUrl, folder, filename)
	{
		let _file = parseFileSetting(fileUrl, this.epubConfig) as ICover;

		_file = Object.assign({}, _file, {
			folder: folder,
			name: filename
		});

		this.epubConfig.additionalFiles.push(_file);

		return this;
	}

	withOption(key: string, value)
	{
		this.epubConfig.options[key] = value;
		return this;
	}

	withInfoPreface(str: string)
	{
		if (str)
		{
			this.epubConfig.infoPreface = str.toString();
		}

		return this;
	}

	addIdentifier(type: string, id?: string)
	{
		this.epubConfig.addIdentifier(type, id);
		return this;
	}

	addLinks(links, rel?: string)
	{
		const self = this;

		links = Array.isArray(links) ? links.slice() : [links];

		links.forEach(function (url)
		{
			if (url)
			{
				self.epubConfig.addLink(url, rel);
			}
		});

		return this;
	}

	addTag(tag)
	{
		tag = (Array.isArray(tag) ? tag : [tag]).reduce(function (a, b)
		{
			if (Array.isArray(b))
			{
				return a.concat(b);
			}
			else
			{
				a.push(b);
			}

			return a;
		}, []);

		this.epubConfig.tags = (this.epubConfig.tags || []).concat(tag);
		return this;
	}

	setPublicationDate(new_data?)
	{
		let data = moment(new_data);

		this.epubConfig.publication = data;
		this.epubConfig.publicationDate = data.format(EpubMaker.dateFormat);
		this.epubConfig.publicationDateYMD = data.format('YYYY-MM-DD');

		return this;
	}

	getFilename(useTitle?: boolean, noExt?: boolean): string
	{
		let ext = this.epubConfig.options.ext || EpubMaker.defaultExt;
		let filename;

		if (this.epubConfig.filename)
		{
			filename = this.epubConfig.filename;
		}
		else if (useTitle && this.epubConfig.title_short)
		{
			filename = this.epubConfig.title_short;
		}
		else if (useTitle && this.epubConfig.title)
		{
			filename = this.epubConfig.title;
		}
		else if (!this.epubConfig.slug)
		{
			// @ts-ignore
			this.epubConfig.slug = shortid();

			filename = this.epubConfig.slug;
		}
		else
		{


			filename = this.epubConfig.slug;
		}

		return trimFilename(filename) + (noExt ? '' : ext);
	}

	vaild()
	{
		let ret = [];

		if (!this.epubConfig.title || !this.epubConfig.slug)
		{
			ret.push('title, slug');
		}

		if (ret.length)
		{
			return ret;
		}

		return null;
	}

	build(options?)
	{
		let self = this;

		if (!this.epubConfig.publication)
		{
			this.setPublicationDate();
		}

		if (!this.epubConfig.uuid)
		{
			this.withUuid(createUUID(this.epubConfig));
		}

		this.epubConfig.$auto();

		let chk = this.vaild();

		if (chk)
		{
			throw chk;
		}

		[]
			.concat(this.epubConfig.sections, this.epubConfig.toc, this.epubConfig.landmarks)
			.forEach(function (section: EpubMaker.Section, index)
			{
				section._EpubMaker_ = self;
			})
		;

		return templateManagers.exec(this.epubConfig.templateName, this, options);
	}

	/**
	 * for node.js
	 *
	 * @param options
	 * @returns {Promise<T>}
	 */
	makeEpub<T = Buffer | Blob>(options?): Promise<T | any | Buffer | Blob>
	{
		let self = this;

		return this.build(options).then(async function (epubZip)
		{
			let generateOptions = Object.assign({
				type: 'nodebuffer',
				mimeType: 'application/epub+zip',
				compression: 'DEFLATE',
				compressionOptions: {
					level: 9
				},
			}, self.epubConfig.options.generateOptions, options);

			console.info('generating epub for: ' + self.epubConfig.title);
			let content = await epubZip.generateAsync(generateOptions);

			return content;
		});
	}
}

export interface ISectionConfig
{
	lang?: string;
}

export interface ISectionContent
{
	title?: string;
	content?: string;

	renderTitle?: boolean;

	cover?: {
		name?: string,
		url?: string,
	}
}

export interface ISlugify
{
	(input: string, ...argv): string
}

export namespace EpubMaker
{
	export let defaultExt = '.epub';
	export let dateFormat = 'YYYY-MM-DDTHH:mm:ss.SSSZ';

	// epubtypes and descriptions, useful for vendors implementing a GUI
	// @ts-ignore
	export const epubtypes = require('./epub-types.js');

	// @ts-ignore
	export let libSlugify = _slugify as ISlugify;

	/**
	 * @epubType Optional. Allows you to add specific epub type content such as [epub:type="titlepage"]
	 * @id Optional, but required if section should be included in toc and / or landmarks
	 * @content Optional. Should not be empty if there will be no subsections added to this section. Format: { title, content, renderTitle }
	 */
	export class Section
	{
		public _EpubMaker_: EpubMaker;

		public epubType;
		public id;
		public content: ISectionContent;
		public includeInToc: boolean;
		public includeInLandmarks: boolean;
		public subSections: Section[] = [];

		public sectionConfig: ISectionConfig = {};

		public parentSection: Section;
		public parentEpubMaker: EpubMaker;

		constructor(epubType, id, content, includeInToc?: boolean, includeInLandmarks?: boolean, ...argv)
		{
			this.epubType = epubType;
			this.id = id;

			this.includeInToc = includeInToc;
			this.includeInLandmarks = includeInLandmarks;
			this.subSections = [];

			/*
			this.content = content;
			if (content)
			{
				content.renderTitle = content.renderTitle !== false; // 'undefined' should default to true
			}
			*/

			this.setContent(content, true);
		}

		/**
		 *
		 * @param {ISectionContent|string} content
		 * @param {boolean} allow_null
		 * @returns {this}
		 */
		setContent(content: ISectionContent, allow_null?: boolean)
		{
			let o = {} as ISectionContent;

			if (typeof content == 'string')
			{
				o.content = content;
			}
			else if (content.title || content.content || content.renderTitle || content.cover)
			{
				o = content;
			}

			if (Object.keys(o).length)
			{
				if (this.content)
				{
					this.content = Object.assign(this.content, o);
				}
				else
				{
					this.content = o;
				}

				this.content.renderTitle = this.content.renderTitle !== false;

			} else if (content)
			{
				this.content = content;
			}
			else if (!allow_null)
			{
				throw new ReferenceError();
			}

			return this;
		}

		get epubTypeGroup()
		{
			return epubtypes.getGroup(this.epubType);
		}

		get lang()
		{
			return this.sectionConfig.lang || (this._EpubMaker_ ? this._EpubMaker_.lang : null) || null;
		}

		get langMain()
		{
			return (this._EpubMaker_ ? this._EpubMaker_.lang : null) || null;
		}

		static create(epubType, id, content, includeInToc: boolean, includeInLandmarks: boolean, ...argv)
		{
			return new this(epubType, id, content, includeInToc, includeInLandmarks, ...argv);
		}

		withSubSection(subsection: Section)
		{
			subsection.parentSection = this;

			this.subSections.push(subsection);
			return this;
		};

		collectToc()
		{
			return this.collectSections(this, 'includeInToc');
		};

		collectLandmarks()
		{
			return this.collectSections(this, 'includeInLandmarks');
		};

		collectSections(section: Section, prop: string): Section[]
		{
			let sections = section[prop] ? [section] : [];
			for (let i = 0; i < section.subSections.length; i++)
			{
				Array.prototype.push.apply(sections, this.collectSections(section.subSections[i], prop));
			}
			return sections;
		}
	}
}

export default EpubMaker;

if (typeof window !== 'undefined')
{
	// @ts-ignore
	window.EpubMaker = EpubMaker;
}
