# -*- coding: utf-8 -*-
#/#############################################################################
#
#    Span Tree
#    Copyright (C) 2004-TODAY Span Tree(<http://www.spantreeng.com/>).
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
#/#############################################################################
from openerp.osv import osv, fields


class aged_sale_report_wiz(osv.osv_memory):
    _name = "aged.sale.report.wiz"

    _columns = {
        'range':fields.selection([
            ('date', 'By Date'),
            ('month', 'By Month'),
            ], 'Range'),
        'start_date':fields.date("From Date"),
        'end_date':fields.date("End Date"),
        'from_period_id':fields.many2one("account.period", "From Month"),
        'to_period_id':fields.many2one("account.period", "To Month")
    }
    _defaults = {
         "range":'date'
     }
    def open_aged_sales(self,cr,uid,ids,context=None):
        if context is None:
            context = {}
        mod_obj = self.pool.get('ir.model.data')
        act_obj = self.pool.get('ir.actions.act_window')
        period_obj = self.pool.get('account.period')

        result = mod_obj.get_object_reference(cr, uid, 'st_sale_report', 'action_aged_sale_order_report')
        id = result and result[1] or False
        result = act_obj.read(cr, uid, [id], context=context)[0]

        data = self.read(cr, uid, ids, [], context=context)[0]
        result['domain'] = []
        if data['from_period_id'] and data['to_period_id']:
            period_from = data.get('from_period_id', False) and data['from_period_id'][0] or False
            period_to = data.get('to_period_id', False) and data['to_period_id'][0] or False
            from_date = period_obj.browse(cr, uid, period_from, context = context).date_start
            to_date = period_obj.browse(cr, uid, period_to, context = context).date_stop
            result['domain'].append(('date_order', '>=', from_date))
            result['domain'].append(('date_order', '<=', to_date))
        if data['start_date'] and data['end_date']:
            result['domain'].append(('date_order', '>=', data['start_date']))
            result['domain'].append(('date_order', '<=', data['end_date']))
        result['domain'].append(('invoice_ids', '!=', False))
        return result
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4: