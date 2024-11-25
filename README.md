# b2again-deno-tools

![b2again.org](./icons/b2again.org.svg)

A [monorepo](https://en.wikipedia.org/wiki/Monorepo)
of tools for the **b2again&nbsp;CMS** project.
Since the `blue-eyes` and `pluperfect` tools needed to share code,
I decided to build a _monorepo_ for the **b2again**
[deno](https://docs.deno.com/) tools. This will never be a true _monorepo_,
since it will not include the core CMS code.

Most code in the **b2again&nbsp;CMS** is under the GNU General Public License
[version 2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html) or
[version 3](https://www.gnu.org/licenses/gpl-3.0.en.html).
Some code is licensed as "GPLv2 or later", some as "GPLv3 or later".

All code in **this repository** is currently released under the
[Apache 2.0 License](https://apache.org/licenses/LICENSE-2.0).
Although, I am not opposed to dual licensing it with either GPL v3
or the [MIT](https://opensource.org/license/mit) license, if there is any demand.

Real soon now, the repo will include:

- [x] [pluperfect](./pluperfect/README.md) - keeps the archive at downloads.b2again.org in sync
- [ ] [blue-eyes](./blue-eyes/README.md) - API server for api.b2again.org
- [ ] [winchell](./winchell/README.md) - reports on everything.
- [ ] [demattic](./demattic/README.md) - automattion of a rebranding fork
- [ ] docs - some documentation
- [x] lib - common code
- [x] icons - shared visual assets
