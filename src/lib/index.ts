// import pson
export function addFormatters() {
    (window as any).formatNumber = (data: number, type: any, row: any, meta: any): string => {
        return data.toLocaleString("en-US");
    }

    (window as any).formatMoney = (data: number, type: any, row: any, meta: any): string => {
        return "$" + data.toLocaleString("en-US");
    }

    (window as any).formatDate = (data: number, type: any, row: any, meta: any): string => {
        if (data == -1) return "N/A";
        let date = new Date(data);
        return date.toISOString().split('T')[0];
    }
}

async function streamToUint8Array(readableStream: any): Promise<Uint8Array> {
    const reader = readableStream.getReader();
    const chunks = [];
    let result;
    while (!result?.done) {
        result = await reader.read();
        if (!result.done) {
            chunks.push(result.value);
        }
    }
    return new Uint8Array(chunks.reduce((acc, val) => acc.concat(Array.from(val)), []));
}

export const decompress = async (url: string) => {
    const ds = new DecompressionStream('gzip');
    const response = await fetch(url);
    const blob_in = await response.blob();
    const stream_in = blob_in.stream().pipeThrough(ds);
    const blob_out = await new Response(stream_in).blob();
    return blob_out;
};
  
export const decompressBson = async (url: string) => {
    let result = await decompress(url);
    let stream: ReadableStream<Uint8Array> = result.stream();
    let uint8Array = await streamToUint8Array(stream);
    var PSON = dcodeIO.PSON;
    var pson = new PSON.StaticPair([]);
    return pson.decode(uint8Array);
};

export function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function htmlToElement(html: string): ChildNode | null {
    var template = document.createElement('template');
    html = html.trim();
    template.innerHTML = html;
    return template.content.firstChild;
}

export function modalStrWithCloseButton(title: string, bodyStr: string) {
    let bodyElem = document.createElement("div");
    bodyElem.innerHTML = bodyStr;
    modalWithCloseButton(title, bodyElem);
}

export function modalWithCloseButton(title: string, body: HTMLElement) {
    modal(title, body, `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`);
}
  
export function modal(title: string, body: HTMLElement, footer: string) {
      let myModal = document.getElementById("exampleModal");
  
      var html = `<div class="modal fade" id="exampleModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
          <div class="modal-dialog">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title" id="exampleModalLabel"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close">
                          <span aria-hidden="true">&times;</span>
                      </button>
                  </div>
                  <div class="modal-body"></div>
                  <div class="modal-footer"></div>
              </div>
          </div>
      </div>`
  
    if (myModal == null) {
        let myModal = htmlToElement(html);
        document.body.appendChild(myModal as Node);
    }
    let createdModal = document.getElementById("exampleModal") as HTMLElement;
    createdModal.getElementsByClassName("modal-title")[0].innerHTML = title;
    let myBody = createdModal.getElementsByClassName("modal-body")[0];
    myBody.innerHTML = "";
    myBody.appendChild(body);
    createdModal.getElementsByClassName("modal-footer")[0].innerHTML = footer;
    (window as any).bootstrap.Modal.getOrCreateInstance(createdModal).show();
  }

export function addTable(container: HTMLElement, id: string) {
    container.innerHTML = `
    <button class="btn btn-primary" type="button" data-bs-toggle="collapse" data-bs-target="#tblCol" aria-expanded="false" aria-controls="tblCol">
        <i class="bi bi-table"></i>&nbsp;Customize
    </button>
    <div class="collapse table-toggles" id="tblCol"></div>
    <table id="${id}" class="table compact table-bordered table-sm d-none" style="width:100%">
        <thead class="table-danger"><tr></tr></thead>
        <tbody></tbody>
        <tfoot><tr></tr></tfoot>
    </table>`;
}

export function setupContainer(container: HTMLElement, data: {columns: string[], data: any[][], searchable: number[], visible: number[], cell_format: {[key: string]: number[];}, row_format: ((row: HTMLElement, data: {[key: string]: any}, index: number) => void) | null, sort: [number, string]}) {
    addTable(container, uuidv4());
    let table = container.getElementsByTagName("table")[0];
    setupTable(container, table, data);
}

export function setupTable(containerElem: HTMLElement, tableElem: HTMLElement, dataSetRoot: {columns: string[], data: any[][], searchable: number[], visible: number[], cell_format: {[key: string]: number[];}, row_format: ((row: HTMLElement, data: {[key: string]: any}, index: number) => void) | null, sort: [number, string]}) {
    let startMS: number = Date.now();
    let jqContainer = $(containerElem);
    let jqTable = $(tableElem);

    let dataColumns = dataSetRoot["columns"];
    let dataList = dataSetRoot["data"];
    let searchableColumns = dataSetRoot["searchable"];
    let visibleColumns = dataSetRoot["visible"];
    let cell_format = dataSetRoot["cell_format"];
    let row_format = dataSetRoot["row_format"];
    let sort = dataSetRoot["sort"];
    if (sort == null) sort = [0, 'asc'];

    let dataObj: {}[] = [];
	dataList.forEach(function (row, index) {
		let obj: {[key: string]: any} = {}; // Add index signature
		for (let i = 0; i < dataColumns.length; i++) {
			obj[dataColumns[i]] = row[i];
		}
		dataObj.push(obj);
	});

    let cellFormatByCol: { [key: number]: (data: number, type: any, row: any, meta: any) => void } = {};
    if (cell_format != null) {
        for (let func in cell_format) {
            let cols: number[] = cell_format[func];
            for (let col of cols) {
                let funcObj = (window as any)[func] as Function;
                cellFormatByCol[col] = funcObj as any;
                if (funcObj == null) {
                    console.log("No function found for " + func);
                }
            }
        }
    }

    let columnsInfo: { data: string, className?: string, render?: any, visible?: boolean }[] = [];
    if (dataColumns.length > 0) {
        for (let i = 0; i < dataColumns.length; i++) {
            let columnInfo: { data: string; className: string; render?: any } = {data: dataColumns[i], className: 'details-control'};
            let renderFunc = cellFormatByCol[i];
            if (renderFunc != null) {
                columnInfo.render = renderFunc;
            }
            columnsInfo.push(columnInfo);
        }
    }

    for(let i = 0; i < columnsInfo.length; i++) {
        let columnInfo = columnsInfo[i];
        let title = columnInfo["data"];
        if (visibleColumns != null) {
            columnInfo["visible"] = visibleColumns.includes(i) as boolean;
        }
        let th,tf;
        if (title == null) {
            th = '';
            tf = '';
        } else {
            if (searchableColumns == null || searchableColumns.includes(i)) {
                th = '<input type="text" placeholder="'+ title +'" style="width: 100%;" />';
            } else {
                th = title;
            }
            if (i != 0) {
                tf = "<button class='toggle-vis btn btn-sm btn-outline-danger' data-column='" + i + "'>-" + title + "</button>";
            } else {
                tf = '';
            }
        }
        jqTable.find("thead tr").append("<th>" + th + "</th>");
        let rows = jqTable.find("tfoot tr").append("<th>" + tf + "</th>");
        if (i != 0 && typeof columnInfo["visible"] === 'boolean' && columnInfo["visible"] === false) {
            let row = rows.children().last();
            let toggle = row.children().first();
            (toggle[0] as any).oldParent = row[0];
            toggle = jqContainer.find(".table-toggles").append(toggle);
        }
    }

    let searchSet = new Set<number>(searchableColumns);

    // table initialization
    let table = (jqTable as any).DataTable( {
        data: dataObj,
        paging: true,
        deferRender: true,
        orderClasses: false,
        columns: columnsInfo,
        order: [sort],
        lengthMenu: [ [10, 25, 50, 100, -1], [10, 25, 50, 100, "All"] ],
        createdRow: row_format,
        initComplete: function () {
            let that = this.api();
            that.columns().every( function (index: number) {
                if (!searchSet.has(index)) return;
                let column = that.column( index );
                let title = columnsInfo[index].data;
                if (title != null) {
                    let data = column.data();
                    let unique = data.unique();
                    let uniqueCount = unique.count();
                    if (uniqueCount > 1 && uniqueCount < 24 && uniqueCount < data.count() / 2) {
                        let select = $('<select><option value=""></option></select>')
                            .appendTo($(column.header()).empty() )
                            .on( 'change', function () {
                                let val = ($.fn as any).dataTable.util.escapeRegex(
                                    $(this).val()
                                );

                                column
                                    .search( val ? '^'+val+'$' : '', true, false )
                                    .draw();
                            });

                        unique.sort().each( function ( d: any, j: any ) {
                            select.append('<option value="'+d+'">'+d+'</option>' );
                        });

                        select.before(title + ": ");
                    }

                }
            });
        }
    });

    // Apply the search
    table.columns().every( function (index: number) {
        var column = table.column( index );
        let myInput = $( 'input', column.header() );
        myInput.on( 'keyup change clear', function () {
            if ( column.search() !== (this as any).value ) {
                column
                    .search((this as any).value )
                    .draw();
            }
        } );
        myInput.click(function(e) {
            e.stopPropagation();
         });
    });

    $("button").click(function(e) {
        e.stopPropagation();
     });

	jqContainer.find('.toggle-vis').on('click', function (e) {
		e.preventDefault();
		// Get the column API object
		let column = table.column( $(this).attr('data-column') );

		// Toggle the visibility
		column.visible( ! column.visible() );
		// move elem
		if (e.target.parentElement && e.target.parentElement.tagName == "TH") {
			(e.target as any).oldParent = e.target.parentElement;
			jqContainer.find(".table-toggles").append(e.target);
		} else {
			(e.target as any).oldParent.append(e.target);
		}
    });

    /* Formatting function for row details - modify as you need */
	function format (d: any) {
        let rows = "";
        table.columns().every( function (index: any) {
            let columnInfo = columnsInfo[index];
            let title = columnInfo["data"];
            if (title != null) {
                if (!table.column(index).visible()) {
                    rows += '<tr>'+
                        '<td>' + title + '</td>'+
                        '<td>'+d[title].toLocaleString("en-US") +'</td>'+
                        '</tr>';
                }
            }
        });
        if (rows == "") rows = "No extra info";
        return '<table class="table table-bordered table-sm" cellspacing="0" border="0">'+rows+'</table>';
    }

    // Add event listener for opening and closing details
    jqTable.find('tbody').on('click', 'td.details-control', function () {
        let tr = $(this).closest('tr');
        let row = table.row( tr );

        if ( row.child.isShown() ) {
            // This row is already open - close it
            row.child.hide();
            tr.removeClass('shown');
        }
        else {
            // Open this row
            row.child( format(row.data()) ).show();
            tr.addClass('shown');
        }
    });

    tableElem.classList.remove("d-none");
}