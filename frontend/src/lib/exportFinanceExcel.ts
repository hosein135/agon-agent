/** خروجی اکسل (SpreadsheetML) با استایل برای گزارش مالی */

function escXml(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatFaDate(iso: unknown) {
  if (!iso) return '—'
  try {
    return new Date(iso as string | number | Date).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

function statusLabel(status: unknown) {
  if (status === 'پرداخت‌شده') return 'پرداخت شده'
  if (status === 'در انتظار تایید') return 'در انتظار تایید رسید'
  if (status === 'پرداخت‌نشده') return 'پرداخت نشده'
  return status || 'پرداخت نشده'
}

function statusStyle(status: unknown) {
  if (status === 'پرداخت‌شده') return 'sPaid'
  if (status === 'در انتظار تایید') return 'sPending'
  return 'sUnpaid'
}

/**
 * @param {object} opts
 * @param {Array} opts.bills
 * @param {object} opts.user - { unit_name, first_name, last_name }
 * @param {string} [opts.fileName]
 */
export function downloadResidentFinanceExcel({
  bills = [],
  user = {},
  fileName,
}: {
  bills?: Array<{ title?: string; amount?: number | string; status?: string; paid_at?: string; created_at?: string }>
  user?: { unit_name?: string; first_name?: string; last_name?: string }
  fileName?: string
} = {}) {
  const unit = user.unit_name || '—'
  const firstName = user.first_name || '—'
  const lastName = user.last_name || '—'
  const nowLabel = new Date().toLocaleString('fa-IR')
  const rows = Array.isArray(bills) ? bills : []

  const headerCells = [
    'واحد',
    'نام ساکن',
    'نام خانوادگی ساکن',
    'عنوان قبض',
    'مبلغ قبض',
    'تاریخ دریافت قبض',
    'تاریخ تایید قبض توسط مدیر',
    'وضعیت قبض',
  ]

  const formatMoney = (n) => `${Number(n || 0).toLocaleString('fa-IR')} تومان`

  const dataXml = rows
    .map((b, idx) => {
      const paid = b.status === 'پرداخت‌شده'
      const approveDate = paid ? formatFaDate(b.paid_at) : '—'
      const receiveDate = formatFaDate(b.created_at)
      const st = statusLabel(b.status)
      const stClass = statusStyle(b.status)
      const zebra = idx % 2 === 0 ? 'sRowA' : 'sRowB'
      return `
    <Row ss:AutoFitHeight="1" ss:Height="28">
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(unit)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(firstName)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(lastName)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(b.title || '—')}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(formatMoney(b.amount))}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(receiveDate)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(approveDate)}</Data></Cell>
      <Cell ss:StyleID="${stClass}"><Data ss:Type="String">${escXml(st)}</Data></Cell>
    </Row>`
    })
    .join('')

  const emptyRow = !rows.length
    ? `
    <Row ss:Height="30">
      <Cell ss:MergeAcross="7" ss:StyleID="sEmpty"><Data ss:Type="String">قبضی برای این واحد ثبت نشده است</Data></Cell>
    </Row>`
    : ''

  const paidCount = rows.filter((b) => b.status === 'پرداخت‌شده').length
  const unpaidCount = rows.filter((b) => b.status !== 'پرداخت‌شده').length

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>گزارش مالی واحد ${escXml(unit)}</Title>
  <Author>بلوک هفت شرقی</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
  <WindowHeight>12000</WindowHeight>
  <WindowWidth>20000</WindowWidth>
  <ProtectStructure>False</ProtectStructure>
  <ProtectWindows>False</ProtectWindows>
 </ExcelWorkbook>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Color="#0F172A"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="sTitle">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0369A1" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0369A1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0369A1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0369A1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0369A1"/>
   </Borders>
  </Style>
  <Style ss:ID="sSub">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Bold="1" ss:Color="#0C4A6E"/>
   <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sHead">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0B3B66" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#075985"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#075985"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#075985"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#075985"/>
   </Borders>
  </Style>
  <Style ss:ID="sRowA">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Color="#0F172A"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="sRowB">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Color="#0F172A"/>
   <Interior ss:Color="#F0F9FF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="sPaid">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Bold="1" ss:Color="#14532D"/>
   <Interior ss:Color="#BBF7D0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22C55E"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22C55E"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22C55E"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#22C55E"/>
   </Borders>
  </Style>
  <Style ss:ID="sPending">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Bold="1" ss:Color="#92400E"/>
   <Interior ss:Color="#FDE68A" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F59E0B"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F59E0B"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F59E0B"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F59E0B"/>
   </Borders>
  </Style>
  <Style ss:ID="sUnpaid">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Bold="1" ss:Color="#9F1239"/>
   <Interior ss:Color="#FECDD3" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F43F5E"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F43F5E"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F43F5E"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F43F5E"/>
   </Borders>
  </Style>
  <Style ss:ID="sFoot">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Bold="1" ss:Color="#0B3B66"/>
   <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sEmpty">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="12" ss:Bold="1" ss:Color="#64748B"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="گزارش مالی" ss:RightToLeft="1">
  <Table ss:ExpandedColumnCount="8" ss:ExpandedRowCount="${rows.length + 6}" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="22">
   <Column ss:Index="1" ss:AutoFitWidth="0" ss:Width="80"/>
   <Column ss:Index="2" ss:AutoFitWidth="0" ss:Width="95"/>
   <Column ss:Index="3" ss:AutoFitWidth="0" ss:Width="110"/>
   <Column ss:Index="4" ss:AutoFitWidth="0" ss:Width="140"/>
   <Column ss:Index="5" ss:AutoFitWidth="0" ss:Width="120"/>
   <Column ss:Index="6" ss:AutoFitWidth="0" ss:Width="120"/>
   <Column ss:Index="7" ss:AutoFitWidth="0" ss:Width="140"/>
   <Column ss:Index="8" ss:AutoFitWidth="0" ss:Width="130"/>
   <Row ss:Height="36">
    <Cell ss:MergeAcross="7" ss:StyleID="sTitle"><Data ss:Type="String">گزارش مالی واحد — بلوک هفت شرقی</Data></Cell>
   </Row>
   <Row ss:Height="26">
    <Cell ss:MergeAcross="7" ss:StyleID="sSub"><Data ss:Type="String">واحد ${escXml(unit)}  |  ${escXml(firstName)} ${escXml(lastName)}  |  تاریخ خروجی: ${escXml(nowLabel)}</Data></Cell>
   </Row>
   <Row ss:Height="10"/>
   <Row ss:Height="32">
    ${headerCells.map((h) => `<Cell ss:StyleID="sHead"><Data ss:Type="String">${escXml(h)}</Data></Cell>`).join('')}
   </Row>
   ${dataXml}
   ${emptyRow}
   <Row ss:Height="10"/>
   <Row ss:Height="28">
    <Cell ss:MergeAcross="7" ss:StyleID="sFoot"><Data ss:Type="String">تعداد کل: ${rows.length.toLocaleString('fa-IR')}  |  پرداخت‌شده: ${paidCount.toLocaleString('fa-IR')}  |  پرداخت‌نشده/در انتظار: ${unpaidCount.toLocaleString('fa-IR')}</Data></Cell>
   </Row>
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Landscape" x:RightToLeft="1"/>
    <Header x:Margin="0.3"/>
    <Footer x:Margin="0.3"/>
    <PageMargins x:Bottom="0.4" x:Left="0.3" x:Right="0.3" x:Top="0.4"/>
   </PageSetup>
   <FitToPage/>
   <Print>
    <FitHeight>0</FitHeight>
    <ValidPrinterInfo/>
    <PaperSizeIndex>9</PaperSizeIndex>
    <HorizontalResolution>600</HorizontalResolution>
    <VerticalResolution>600</VerticalResolution>
   </Print>
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
   <ActivePane>2</ActivePane>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
   <DisplayRightToLeft/>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`

  const blob = new Blob(['\uFEFF' + xml], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeUnit = String(unit).replace(/[^\w\u0600-\u06FF-]+/g, '_')
  a.download = fileName || `گزارش-مالی-واحد-${safeUnit}.xls`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
