# -*- coding: utf-8 -*-
##############################################################################
#
#    OpenERP, Open Source Management Solution
#    Copyright (C) 2004-2010 Tiny SPRL (<http://tiny.be>).
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
##############################################################################

import time
from openerp.osv import osv
from openerp.report import report_sxw
import openerp.pooler

class aged_sale_report(report_sxw.rml_parse):

    def __init__(self, cr, uid, name, context={}):
        self.ctx = {}
        self.ctx = context.copy()
        super(aged_sale_report, self).__init__(cr, uid, name, context=context)
        self.localcontext.update({
            'get_obj': self.get_obj,
        })

    def get_obj(self):
        sale_list = []
        sale_obj = self.pool.get("sale.order")
        if self.ctx and self.ctx.get('active_id'):
            rec = self.pool.get("aged.sale.report.wiz").browse(self.cr, self.uid, self.ctx.get('active_id'))
            domain = []
            if rec.sale_person_id:
                domain.append(('user_id', '=', rec.sale_person_id.id))
            if rec.shop_id:
                domain.append(('shop_id', '=', rec.shop_id.id))
            if rec.partner_id:
                domain.append(('partner_id', '=', rec.partner_id.id))
            if rec.state:
                domain.append(('state', '=', rec.state))
            if rec.range:
                if rec.range == 'date' and rec.start_date and rec.end_date:
                    domain.append('&')
                    domain.append(('date_order', '<=', rec.start_date))
                    domain.append(('date_order', '<=', rec.end_date))
                else:
                    if rec.from_period_id and rec.from_period_id:
                        domain.append('&')
                        domain.append(('date_order', '<=', rec.from_period_id.date_start))
                        domain.append(('date_order', '<=', rec.from_period_id.date_stop))
        sale_ids = sale_obj.search(self.cr, self.uid,domain)
        if sale_ids:
            for sale in sale_obj.browse(self.cr, self.uid, sale_ids):
                sale_list.append(sale)
        return sale_list

report_sxw.report_sxw('report.aged.sale.report','aged.sale.report.wiz', 'addons/st_sale_report/report/aged_sale_report.rml', 
                      parser=aged_sale_report, header=False)

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
